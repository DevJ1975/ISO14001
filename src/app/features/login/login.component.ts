import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { FieldAuditStore } from '../../core/field/field-audit-store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** Same lightweight shape check used elsewhere (e.g. user invites). */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterLink, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly store = inject(FieldAuditStore);
  private readonly router = inject(Router);
  protected readonly config = inject(APP_CONFIG);
  private readonly i18n = inject(I18nService);

  protected readonly email = signal(this.config.demo.email);
  protected readonly password = signal(this.config.demo.password);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  // --- TOTP MFA second factor (shown only when the backend challenges) ---
  protected readonly mfaChallenge = signal<string | null>(null);
  protected readonly mfaCode = signal('');
  protected readonly mfaError = signal<string | null>(null);

  // --- SSO (OIDC) affordance: revealed once the entered email's tenant is known.
  // The login screen can't know the tenant before sign-in, so SSO is offered via
  // an explicit "Sign in with SSO" control that asks for the tenant id. Kept
  // minimal + typed; the redirect itself is built server-side by /auth/sso/initiate.
  protected readonly ssoBusy = signal(false);

  /** Validation only surfaces after a field is blurred, so the pre-filled form stays calm. */
  protected readonly emailTouched = signal(false);
  protected readonly passwordTouched = signal(false);

  protected readonly emailError = computed(() =>
    this.emailTouched() && !EMAIL_RE.test(this.email().trim()) ? this.i18n.t('login.emailInvalid') : null,
  );
  protected readonly passwordError = computed(() =>
    this.passwordTouched() && this.password().length === 0 ? this.i18n.t('login.passwordRequired') : null,
  );
  protected readonly canSubmit = computed(() => EMAIL_RE.test(this.email().trim()) && this.password().length > 0);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    if (!this.canSubmit()) {
      this.emailTouched.set(true);
      this.passwordTouched.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.auth.login(this.email(), this.password());
      if (result.status === 'mfaRequired') {
        // Hold for the second factor; don't load the workspace yet.
        this.mfaChallenge.set(result.challengeToken);
        this.mfaError.set(null);
        return;
      }
      await this.enterWorkspace();
    } catch {
      this.error.set(this.i18n.t('login.failed'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Submit the 6-digit TOTP code to complete an MFA-gated sign-in. */
  protected async submitMfa(event: Event): Promise<void> {
    event.preventDefault();
    const challenge = this.mfaChallenge();
    if (this.busy() || !challenge) return;
    if (!/^[0-9]{6}$/.test(this.mfaCode().trim())) {
      this.mfaError.set('Enter the 6-digit code from your authenticator app.');
      return;
    }
    this.busy.set(true);
    this.mfaError.set(null);
    try {
      await this.auth.completeMfaLogin(challenge, this.mfaCode().trim());
      await this.enterWorkspace();
    } catch {
      this.mfaError.set('That code did not match. Check the time on your device and try again.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Cancel the MFA step and return to the password form. */
  protected cancelMfa(): void {
    this.mfaChallenge.set(null);
    this.mfaCode.set('');
    this.mfaError.set(null);
  }

  /** Start an OIDC sign-in for a tenant: the server builds the redirect URL. */
  protected async signInWithSso(tenantId: string): Promise<void> {
    const id = tenantId.trim();
    if (!id || this.ssoBusy()) return;
    this.ssoBusy.set(true);
    this.error.set(null);
    try {
      const { authorizationUrl, state } = await this.auth.ssoInitiate(id);
      // Stash state for the callback to verify (CSRF), then redirect to the IdP.
      sessionStorage.setItem('sso-state', state);
      window.location.assign(authorizationUrl);
    } catch {
      this.error.set('SSO is not configured for that workspace, or the backend is unavailable.');
    } finally {
      this.ssoBusy.set(false);
    }
  }

  private async enterWorkspace(): Promise<void> {
    await this.store.reload();
    await this.router.navigateByUrl(this.auth.isAuditee() ? '/portal' : '/');
  }

  protected async continueOffline(): Promise<void> {
    this.auth.enterOffline('auditor');
    await this.store.reload();
    await this.router.navigateByUrl('/');
  }

  /** Preview the auditee/client portal without a backend. */
  protected async continueAsClient(): Promise<void> {
    this.auth.enterOffline('clientViewer');
    await this.store.reload();
    await this.router.navigateByUrl('/portal');
  }
}
