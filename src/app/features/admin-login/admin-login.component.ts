import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Dedicated platform-superadmin sign-in — a separate screen and endpoint from the
 * tenant login. On success the superadmin lands in the provisioning console.
 */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.superadminLogin(this.email(), this.password());
      await this.router.navigateByUrl('/admin');
    } catch {
      this.error.set('Sign-in failed. Check the credentials, or that a superadmin has been seeded.');
    } finally {
      this.busy.set(false);
    }
  }
}
