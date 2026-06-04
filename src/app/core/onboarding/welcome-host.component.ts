import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { OnboardingService } from './onboarding.service';

/**
 * First-run welcome card. Mounted once in the shell; shows only after the user
 * is signed in (or in offline demo) and hasn't seen it. A single accessible
 * dialog (trapped focus, Esc to dismiss) — deliberately lightweight, no tour
 * library, brand-consistent (reuses .panel-style surface + tokens).
 */
@Component({
  selector: 'app-welcome-host',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'dismiss()' },
  template: `
    @if (visible()) {
      <button type="button" class="wl-scrim" aria-label="Dismiss" (click)="dismiss()"></button>
      <div
        class="wl-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wl-title"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
      >
        <span class="wl-mark"><mat-icon aria-hidden="true">health_and_safety</mat-icon></span>
        <p class="tv-eyebrow">Welcome to Soteria Signum</p>
        <h2 id="wl-title">Field audits, the calm way</h2>
        <p class="wl-lead">A quick orientation before you start:</p>
        <ul class="wl-list">
          <li>
            <mat-icon aria-hidden="true">checklist</mat-icon>
            <span><strong>Fieldwork</strong> walks every ISO 45001 clause, one at a time.</span>
          </li>
          <li>
            <mat-icon aria-hidden="true">search</mat-icon>
            <span>Press <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> to jump to any section.</span>
          </li>
          <li>
            <mat-icon aria-hidden="true">cloud_done</mat-icon>
            <span>Everything <strong>autosaves</strong> and keeps working offline.</span>
          </li>
        </ul>
        <div class="wl-actions">
          <button mat-stroked-button type="button" (click)="takeTour()">Start in Fieldwork</button>
          <button mat-flat-button color="primary" type="button" (click)="dismiss()">
            <mat-icon aria-hidden="true">arrow_forward</mat-icon>
            Get started
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .wl-scrim {
        position: fixed;
        inset: 0;
        border: 0;
        padding: 0;
        appearance: none;
        background: rgba(10, 10, 10, 0.5);
        cursor: default;
        z-index: 1200;
      }
      .wl-box {
        position: fixed;
        z-index: 1201;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(440px, calc(100vw - 28px));
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 28px;
        box-shadow: var(--shadow-lg);
        animation: rise 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .wl-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: var(--accent-soft);
        color: var(--primary);
        margin-bottom: 14px;
      }
      .wl-box h2 {
        margin: 4px 0 0;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .wl-lead {
        margin: 8px 0 16px;
        color: var(--muted);
      }
      .wl-list {
        list-style: none;
        margin: 0 0 22px;
        padding: 0;
        display: grid;
        gap: 12px;
      }
      .wl-list li {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        line-height: 1.45;
      }
      .wl-list mat-icon {
        flex: none;
        color: var(--primary);
      }
      .wl-list kbd {
        font-family: var(--tv-font-mono);
        font-size: 12px;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        padding: 1px 6px;
      }
      .wl-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `,
  ],
})
export class WelcomeHostComponent {
  private readonly onboarding = inject(OnboardingService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected visible(): boolean {
    return !this.onboarding.seen() && !!this.auth.user();
  }

  protected dismiss(): void {
    if (this.visible()) this.onboarding.dismiss();
  }

  protected takeTour(): void {
    this.onboarding.dismiss();
    void this.router.navigate(['/fieldwork']);
  }
}
