import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';

export interface AuthUser {
  uid: string;
  /** Null for the platform superadmin, who is not scoped to a tenant. */
  tenantId: string | null;
  role: string;
  displayName: string;
  email: string;
}

interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

/** Login may resolve to a session OR an MFA challenge that needs a second step. */
interface MfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
}

type AuthResponse = LoginResponse | MfaChallengeResponse;

function isMfaChallenge(response: AuthResponse): response is MfaChallengeResponse {
  return (response as MfaChallengeResponse).mfaRequired === true;
}

/** Result of a login attempt: either complete, or awaiting the TOTP second factor. */
export type LoginResult = { status: 'complete' } | { status: 'mfaRequired'; challengeToken: string };

const TOKEN_KEY = 'trainovate-token';
const USER_KEY = 'trainovate-user';
const OFFLINE_KEY = 'trainovate-offline';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  readonly token = signal<string | null>(this.readValidToken());
  readonly user = signal<AuthUser | null>(this.readUser());
  readonly offline = signal<boolean>(this.read(OFFLINE_KEY) === '1');
  readonly isAuthenticated = computed(() => this.token() !== null);
  /** Allowed into the workspace: signed in, or explicitly continuing in offline demo mode. */
  readonly canEnter = computed(() => this.isAuthenticated() || this.offline());

  /** The auditee (client) role: a scoped portal user, not an auditor-workspace user. */
  readonly isAuditee = computed(() => this.user()?.role === 'clientViewer');
  /** The platform superadmin, who runs the provisioning console (no tenant). */
  readonly isSuperadmin = computed(() => this.user()?.role === 'platformSuperadmin');
  /** Any auditor-side role (everything that isn't the auditee portal or the superadmin). */
  readonly isAuditor = computed(() => {
    const role = this.user()?.role;
    return role !== undefined && role !== 'clientViewer' && role !== 'platformSuperadmin';
  });

  async login(email: string, password: string): Promise<LoginResult> {
    return this.authenticate('/auth/login', email, password);
  }

  /** Dedicated platform-superadmin sign-in (separate screen, separate endpoint). */
  async superadminLogin(email: string, password: string): Promise<LoginResult> {
    return this.authenticate('/auth/superadmin-login', email, password);
  }

  /** Begin an OIDC sign-in: the server returns the IdP authorization URL + state. */
  async ssoInitiate(tenantId: string): Promise<{ authorizationUrl: string; state: string }> {
    return firstValueFrom(
      this.http.post<{ authorizationUrl: string; state: string }>(`${this.config.apiBaseUrl}/auth/sso/initiate`, { tenantId }),
    );
  }

  /** Complete an MFA-gated login: exchange the challenge + TOTP code for a session. */
  async completeMfaLogin(challengeToken: string, code: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.config.apiBaseUrl}/auth/mfa/login`, { challengeToken, code }),
    );
    this.applySession(response);
  }

  private async authenticate(path: string, email: string, password: string): Promise<LoginResult> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.config.apiBaseUrl}${path}`, { email: email.trim(), password }),
    );
    if (isMfaChallenge(response)) {
      return { status: 'mfaRequired', challengeToken: response.challengeToken };
    }
    this.applySession(response);
    return { status: 'complete' };
  }

  private applySession(response: LoginResponse): void {
    this.token.set(response.token);
    this.user.set(response.user);
    this.offline.set(false);
    this.write(TOKEN_KEY, response.token);
    this.write(USER_KEY, JSON.stringify(response.user));
    this.remove(OFFLINE_KEY);
  }

  /**
   * Enter the workspace without a backend; the field store runs on local data.
   * `role` chooses which experience to preview — the auditor workspace
   * (default) or the auditee/client portal (`clientViewer`).
   */
  enterOffline(role: 'auditor' | 'clientViewer' = 'auditor'): void {
    this.offline.set(true);
    const isClient = role === 'clientViewer';
    this.user.set({
      uid: isClient ? 'guest-client' : 'guest',
      tenantId: this.config.tenantId,
      role,
      displayName: isClient ? 'Client demo' : 'Offline demo',
      email: '',
    });
    this.write(OFFLINE_KEY, '1');
    this.write(USER_KEY, JSON.stringify(this.user()));
  }

  logout(): void {
    this.token.set(null);
    this.user.set(null);
    this.offline.set(false);
    this.remove(TOKEN_KEY);
    this.remove(USER_KEY);
    this.remove(OFFLINE_KEY);
  }

  private readValidToken(): string | null {
    const token = this.read(TOKEN_KEY);
    if (!token || this.isExpired(token)) {
      this.remove(TOKEN_KEY);
      this.remove(USER_KEY);
      return null;
    }
    return token;
  }

  private readUser(): AuthUser | null {
    const raw = this.read(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  private isExpired(token: string): boolean {
    try {
      const segment = token.split('.')[1] ?? '';
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded)) as { exp?: number };
      return typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }

  private read(key: string): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  }

  private write(key: string, value: string): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  }

  private remove(key: string): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  }
}
