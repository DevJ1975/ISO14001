import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';

export interface AuthUser {
  uid: string;
  tenantId: string;
  role: string;
  displayName: string;
  email: string;
}

interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

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

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.config.apiBaseUrl}/auth/login`, { email: email.trim(), password }),
    );
    this.token.set(response.token);
    this.user.set(response.user);
    this.offline.set(false);
    this.write(TOKEN_KEY, response.token);
    this.write(USER_KEY, JSON.stringify(response.user));
    this.remove(OFFLINE_KEY);
  }

  /** Enter the workspace without a backend; the field store runs on local data. */
  enterOffline(): void {
    this.offline.set(true);
    this.user.set({ uid: 'guest', tenantId: this.config.tenantId, role: 'auditor', displayName: 'Offline demo', email: '' });
    this.write(OFFLINE_KEY, '1');
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
