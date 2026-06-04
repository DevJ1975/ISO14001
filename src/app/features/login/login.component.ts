import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { FieldAuditStore } from '../../core/field/field-audit-store';

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

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.email(), this.password());
      await this.store.reload();
      await this.router.navigateByUrl(this.auth.isAuditee() ? '/portal' : '/');
    } catch {
      this.error.set('Sign-in failed. Check the credentials, or that the backend (MongoDB + JWT_SECRET) is configured.');
    } finally {
      this.busy.set(false);
    }
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
