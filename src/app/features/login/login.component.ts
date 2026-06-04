import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { FieldAuditStore } from '../../core/field/field-audit-store';

/** Same lightweight shape check used elsewhere (e.g. user invites). */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly store = inject(FieldAuditStore);
  private readonly router = inject(Router);
  protected readonly config = inject(APP_CONFIG);

  protected readonly email = signal(this.config.demo.email);
  protected readonly password = signal(this.config.demo.password);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Validation only surfaces after a field is blurred, so the pre-filled form stays calm. */
  protected readonly emailTouched = signal(false);
  protected readonly passwordTouched = signal(false);

  protected readonly emailError = computed(() =>
    this.emailTouched() && !EMAIL_RE.test(this.email().trim()) ? 'Enter a valid email address.' : null,
  );
  protected readonly passwordError = computed(() =>
    this.passwordTouched() && this.password().length === 0 ? 'Enter your password.' : null,
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
      await this.auth.login(this.email(), this.password());
      await this.store.reload();
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Sign-in failed. Check the credentials, or that the backend (MongoDB + JWT_SECRET) is configured.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async continueOffline(): Promise<void> {
    this.auth.enterOffline();
    await this.store.reload();
    await this.router.navigateByUrl('/');
  }
}
