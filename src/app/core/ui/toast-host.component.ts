import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { Toast, ToastService, ToastTone } from './toast.service';

/**
 * Renders the transient toast stack. Place once in the shell (next to
 * `<app-confirm-host />`); any component triggers it via `ToastService`. The
 * stack is a polite live region so screen readers announce each toast. Tones
 * reuse the app-wide `[data-tone]` palette so toasts match the brand.
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" role="status" aria-live="polite" aria-atomic="false">
      @for (t of toast.items(); track t.id) {
        <div class="toast" [attr.data-tone]="t.tone">
          <mat-icon aria-hidden="true">{{ icon(t.tone) }}</mat-icon>
          <span class="toast-msg">{{ t.message }}</span>
          @if (t.action; as action) {
            <button type="button" class="toast-action" (click)="act(t)">{{ action.label }}</button>
          }
          <button type="button" class="toast-close" aria-label="Dismiss" (click)="toast.dismiss(t.id)">
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-stack {
        position: fixed;
        z-index: 1100;
        left: 50%;
        bottom: calc(16px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: min(420px, calc(100vw - 24px));
        pointer-events: none;
      }
      @media (min-width: 720px) {
        .toast-stack {
          left: auto;
          right: 24px;
          transform: none;
          align-items: flex-end;
        }
      }
      .toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 12px 12px 12px 14px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow);
        animation: rise-soft 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .toast[data-tone='positive'] {
        border-color: var(--tone-positive-bd);
      }
      .toast[data-tone='positive'] mat-icon {
        color: var(--tone-positive-fg);
      }
      .toast[data-tone='progress'] {
        border-color: var(--tone-progress-bd);
      }
      .toast[data-tone='progress'] mat-icon {
        color: var(--tone-progress-fg);
      }
      .toast[data-tone='critical'] {
        border-color: var(--tone-critical-bd);
      }
      .toast[data-tone='critical'] mat-icon {
        color: var(--tone-critical-fg);
      }
      .toast > mat-icon {
        flex: none;
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
      .toast-msg {
        flex: 1 1 auto;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.35;
      }
      .toast-action {
        flex: none;
        border: 0;
        background: transparent;
        color: var(--primary);
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 8px;
      }
      .toast-action:hover {
        background: var(--accent-soft);
      }
      .toast-close {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
      }
      .toast-close:hover {
        background: var(--tone-neutral-bg);
        color: var(--text);
      }
      .toast-close mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    `,
  ],
})
export class ToastHostComponent {
  protected readonly toast = inject(ToastService);

  protected act(toast: Toast): void {
    this.toast.runAction(toast);
  }

  protected icon(tone: ToastTone): string {
    if (tone === 'positive') return 'check_circle';
    if (tone === 'critical') return 'error';
    if (tone === 'progress') return 'info';
    return 'info';
  }
}
