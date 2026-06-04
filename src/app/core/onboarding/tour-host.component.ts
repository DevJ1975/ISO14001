import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { TourService } from './tour.service';

/**
 * Guided tour overlay. Mounted once in the shell; renders the active step from
 * `TourService`. A single accessible dialog mirroring the command-palette /
 * confirm-host pattern: a `<button>` scrim, trapped focus, Esc to close, ARIA
 * roles, and keyboard next/prev. OnPush + signals throughout.
 *
 * Navigation is data-driven from `TourService.steps`; advancing to a step with
 * a `route` quietly routes there so the auditor sees the real section behind
 * the explanation.
 */
@Component({
  selector: 'app-tour-host',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    @if (tour.open()) {
      <button type="button" class="tour-scrim" aria-label="Close tour" (click)="dismiss()"></button>
      <div
        class="tour-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
      >
        <div class="tour-top">
          <span class="tour-mark"><mat-icon aria-hidden="true">{{ tour.step().icon ?? 'tips_and_updates' }}</mat-icon></span>
          <button type="button" class="tour-skip" (click)="dismiss()">Skip tour</button>
        </div>
        <p class="tv-eyebrow" aria-hidden="true">Guided tour</p>
        <h2 id="tour-title">{{ tour.step().title }}</h2>
        <p id="tour-body" class="tour-body">{{ tour.step().body }}</p>

        <div class="tour-dots" role="tablist" aria-label="Tour steps">
          @for (s of tour.steps; track s.id; let i = $index) {
            <button
              type="button"
              class="tour-dot"
              role="tab"
              [class.active]="i === tour.index()"
              [attr.aria-selected]="i === tour.index()"
              [attr.aria-label]="'Step ' + (i + 1) + ': ' + s.title"
              (click)="goTo(i)"
            ></button>
          }
        </div>

        <div class="tour-actions">
          <span class="tour-count" aria-live="polite">Step {{ tour.index() + 1 }} of {{ tour.steps.length }}</span>
          <span class="spacer"></span>
          <button mat-stroked-button type="button" [disabled]="tour.isFirst()" (click)="prev()">
            <mat-icon aria-hidden="true">arrow_back</mat-icon>
            Back
          </button>
          @if (tour.isLast()) {
            <button mat-flat-button color="primary" type="button" (click)="next()">
              <mat-icon aria-hidden="true">check</mat-icon>
              Finish
            </button>
          } @else {
            <button mat-flat-button color="primary" type="button" (click)="next()">
              <mat-icon aria-hidden="true">arrow_forward</mat-icon>
              Next
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .tour-scrim {
        position: fixed;
        inset: 0;
        border: 0;
        padding: 0;
        appearance: none;
        background: rgba(10, 10, 10, 0.5);
        cursor: default;
        z-index: 1200;
      }
      .tour-box {
        position: fixed;
        z-index: 1201;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(460px, calc(100vw - 28px));
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 26px 28px 24px;
        box-shadow: var(--shadow-lg);
        animation: rise 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .tour-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .tour-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: var(--accent-soft);
        color: var(--primary);
      }
      .tour-skip {
        border: 0;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 13px;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 8px;
      }
      .tour-skip:hover {
        color: var(--text);
      }
      .tour-box h2 {
        margin: 4px 0 0;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .tour-body {
        margin: 10px 0 18px;
        color: var(--muted);
        line-height: 1.5;
      }
      .tour-dots {
        display: flex;
        gap: 7px;
        margin-bottom: 20px;
      }
      .tour-dot {
        width: 9px;
        height: 9px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: var(--border-strong);
        cursor: pointer;
        transition: background 0.18s ease, width 0.18s ease;
      }
      .tour-dot.active {
        width: 22px;
        background: var(--primary);
      }
      .tour-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .tour-actions .spacer {
        flex: 1 1 auto;
      }
      .tour-count {
        font-size: 13px;
        color: var(--muted);
      }
    `,
  ],
})
export class TourHostComponent {
  protected readonly tour = inject(TourService);
  private readonly router = inject(Router);

  protected onKey(event: KeyboardEvent): void {
    if (!this.tour.open()) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.dismiss();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.prev();
        break;
    }
  }

  protected next(): void {
    this.tour.next();
    this.routeToCurrent();
  }

  protected prev(): void {
    this.tour.prev();
    this.routeToCurrent();
  }

  protected goTo(index: number): void {
    this.tour.goTo(index);
    this.routeToCurrent();
  }

  protected dismiss(): void {
    if (this.tour.open()) this.tour.dismiss();
  }

  /** If the tour is still open, navigate to the active step's section (if it has one). */
  private routeToCurrent(): void {
    if (!this.tour.open()) return;
    const route = this.tour.step().route;
    if (route) void this.router.navigate([route]);
  }
}
