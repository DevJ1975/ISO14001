import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';

interface TokenInfo {
  valid: boolean;
  email?: string;
  purpose?: 'invite' | 'reset';
}

/**
 * Public "set your password" page reached from the emailed link. Validates the
 * single-use token, lets the user choose a password, then sends them to sign in.
 */
@Component({
  selector: 'app-set-password',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './set-password.component.html',
  styleUrl: './set-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPasswordComponent {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  protected readonly loading = signal(true);
  protected readonly info = signal<TokenInfo>({ valid: false });
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);

  protected readonly canSubmit = computed(
    () => this.password().length >= 8 && this.password() === this.confirm() && !this.busy(),
  );

  constructor() {
    void this.validate();
  }

  private async validate(): Promise<void> {
    if (!this.token) {
      this.info.set({ valid: false });
      this.loading.set(false);
      return;
    }
    try {
      const info = await firstValueFrom(
        this.http.get<TokenInfo>(`${this.config.apiBaseUrl}/auth/set-password/${encodeURIComponent(this.token)}`),
      );
      this.info.set(info ?? { valid: false });
    } catch {
      this.info.set({ valid: false });
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post(`${this.config.apiBaseUrl}/auth/set-password`, { token: this.token, password: this.password() }),
      );
      this.done.set(true);
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error;
      this.error.set(typeof message === 'string' && message ? message : 'Could not set your password. The link may have expired.');
    } finally {
      this.busy.set(false);
    }
  }

  protected goToSignIn(): void {
    void this.router.navigateByUrl('/login');
  }
}
