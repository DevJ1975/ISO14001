import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { ConfirmService } from './confirm.service';

/**
 * Global confirmation dialog. Place once in the shell; any component can trigger
 * it via `ConfirmService.ask(...)`. Esc or the backdrop cancels.
 */
@Component({
  selector: 'app-confirm-host',
  standalone: true,
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (confirm.pending(); as req) {
      <button type="button" class="confirm-scrim" aria-label="Dismiss" (click)="confirm.resolve(false)"></button>
      <div class="confirm-box" role="alertdialog" aria-modal="true" [attr.aria-label]="req.title">
        <h2>{{ req.title }}</h2>
        <p>{{ req.message }}</p>
        <div class="confirm-actions">
          <button mat-stroked-button type="button" (click)="confirm.resolve(false)">{{ req.cancelLabel }}</button>
          <button
            mat-flat-button
            type="button"
            class="confirm-go"
            [class.danger]="req.danger"
            (click)="confirm.resolve(true)"
          >
            {{ req.confirmLabel }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .confirm-scrim {
        position: fixed;
        inset: 0;
        border: 0;
        padding: 0;
        appearance: none;
        background: rgba(10, 10, 10, 0.45);
        cursor: default;
        z-index: 1000;
      }
      .confirm-box {
        position: fixed;
        z-index: 1001;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(420px, calc(100vw - 32px));
        background: var(--surface, #fff);
        color: var(--ink, #0a0a0a);
        border-radius: 14px;
        padding: 22px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
      }
      .confirm-box h2 {
        margin: 0 0 8px;
        font-size: 1.1rem;
      }
      .confirm-box p {
        margin: 0 0 18px;
        color: var(--ink-muted, rgba(10, 10, 10, 0.7));
        line-height: 1.45;
      }
      .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .confirm-actions .confirm-go.danger {
        background: var(--signal-red, #d4351c);
        color: #fff;
      }
    `,
  ],
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);

  protected onEscape(): void {
    if (this.confirm.pending()) this.confirm.resolve(false);
  }
}
