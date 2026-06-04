import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { NAV_DESTINATIONS, NavItem } from '../shell/nav';
import { CommandPaletteService } from './command-palette.service';

/**
 * Global command palette (⌘K / Ctrl-K) for jumping between destinations. Reads
 * the shared `NAV_DESTINATIONS` so it stays in lock-step with the shell nav.
 * Keyboard-first and accessible: a modal dialog with trapped focus, a listbox
 * of results, and `aria-activedescendant` so screen readers track the
 * highlighted option.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [MatIconModule, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onGlobalKey($event)' },
  template: `
    @if (palette.open()) {
      <button type="button" class="cmd-scrim" aria-label="Close search" (click)="palette.close()"></button>
      <div
        class="cmd-box"
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump to a section"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
      >
        <div class="cmd-search">
          <mat-icon aria-hidden="true">search</mat-icon>
          <input
            #queryEl
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-results"
            [attr.aria-activedescendant]="results().length ? 'cmd-opt-' + active() : null"
            placeholder="Search sections… (try “findings”)"
            autocomplete="off"
            spellcheck="false"
            [value]="query()"
            (input)="onInput(queryEl.value)"
            (keydown)="onInputKey($event)"
          />
          <kbd class="cmd-esc">Esc</kbd>
        </div>
        <div id="cmd-results" class="cmd-results" role="listbox" aria-label="Sections">
          @for (item of results(); track item.path; let i = $index) {
            <button
              [id]="'cmd-opt-' + i"
              type="button"
              class="cmd-opt"
              role="option"
              [attr.aria-selected]="i === active()"
              [class.active]="i === active()"
              tabindex="-1"
              (mouseenter)="active.set(i)"
              (click)="go(item)"
            >
              <mat-icon aria-hidden="true">{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
              <span class="cmd-path">{{ item.path }}</span>
            </button>
          } @empty {
            <p class="cmd-none">No matching sections.</p>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .cmd-scrim {
        position: fixed;
        inset: 0;
        border: 0;
        padding: 0;
        appearance: none;
        background: rgba(10, 10, 10, 0.45);
        cursor: default;
        z-index: 1200;
      }
      .cmd-box {
        position: fixed;
        z-index: 1201;
        left: 50%;
        top: 14vh;
        transform: translateX(-50%);
        width: min(560px, calc(100vw - 28px));
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: var(--shadow-lg);
        overflow: hidden;
        animation: rise-soft 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .cmd-search {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
      }
      .cmd-search > mat-icon {
        flex: none;
        color: var(--muted);
      }
      .cmd-search input {
        flex: 1 1 auto;
        border: 0;
        outline: none;
        background: transparent;
        color: var(--text);
        font-size: 16px;
      }
      .cmd-esc {
        flex: none;
        font-family: var(--tv-font-mono);
        font-size: 11px;
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 2px 6px;
      }
      .cmd-results {
        list-style: none;
        margin: 0;
        padding: 6px;
        max-height: min(50vh, 380px);
        overflow-y: auto;
      }
      .cmd-opt {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 12px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;
        color: var(--text);
      }
      .cmd-opt mat-icon {
        flex: none;
        color: var(--muted);
      }
      .cmd-opt span:nth-of-type(1) {
        flex: 1 1 auto;
        font-weight: 600;
      }
      .cmd-opt.active {
        background: var(--accent-soft);
      }
      .cmd-opt.active mat-icon,
      .cmd-opt.active span:nth-of-type(1) {
        color: var(--primary);
      }
      .cmd-path {
        font-family: var(--tv-font-mono);
        font-size: 12px;
        color: var(--muted);
      }
      .cmd-none {
        padding: 18px 12px;
        text-align: center;
        color: var(--muted);
      }
    `,
  ],
})
export class CommandPaletteComponent {
  protected readonly palette = inject(CommandPaletteService);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  protected readonly active = signal(0);

  protected readonly results = computed<NavItem[]>(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return [...NAV_DESTINATIONS];
    return NAV_DESTINATIONS.filter(
      (item) =>
        item.label.toLowerCase().includes(term) ||
        item.path.toLowerCase().includes(term) ||
        (item.keywords ?? []).some((keyword) => keyword.includes(term)),
    );
  });

  constructor() {
    // Reset query + selection whenever the palette closes, so it opens fresh.
    effect(() => {
      if (!this.palette.open()) {
        this.query.set('');
        this.active.set(0);
      }
    });
  }

  protected onGlobalKey(event: KeyboardEvent): void {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
      return;
    }
    // "/" opens the palette when the user isn't typing in a field.
    if (event.key === '/' && !this.palette.open() && !this.isTypingTarget(event.target)) {
      event.preventDefault();
      this.palette.openPalette();
    }
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  protected onInputKey(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.palette.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.active.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.active.update((i) => (i - 1 + count) % count);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.results()[this.active()];
        if (item) this.go(item);
        break;
      }
    }
  }

  protected go(item: NavItem): void {
    this.palette.close();
    void this.router.navigate([item.path]);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
}
