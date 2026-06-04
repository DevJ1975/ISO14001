import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { JurisdictionService } from '../jurisdiction/jurisdiction.service';
import { I18nService, type LocaleId } from './i18n.service';
import { TranslatePipe } from './translate.pipe';
import type { JurisdictionId } from '../domain/jurisdiction';

/**
 * Compact shell-header control to pick the active locale and jurisdiction.
 *
 * Native `<select>`s keep it accessible and dependency-free. OnPush; the
 * underlying signals drive re-rendering. Sits next to the theme toggle.
 */
@Component({
  selector: 'app-locale-switcher',
  standalone: true,
  imports: [MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="lj">
      <mat-icon aria-hidden="true">language</mat-icon>
      <span class="sr-only">{{ 'shell.language' | t }}</span>
      <select
        [value]="i18n.locale()"
        (change)="onLocale($any($event.target).value)"
        [attr.aria-label]="'shell.language' | t"
      >
        @for (opt of i18n.options; track opt.id) {
          <option [value]="opt.id">{{ opt.label }}</option>
        }
      </select>
    </label>

    <label class="lj">
      <mat-icon aria-hidden="true">public</mat-icon>
      <span class="sr-only">{{ 'shell.jurisdiction' | t }}</span>
      <select
        [value]="jurisdiction.jurisdiction()"
        (change)="onJurisdiction($any($event.target).value)"
        [attr.aria-label]="'shell.jurisdiction' | t"
      >
        @for (opt of jurisdiction.options; track opt.id) {
          <option [value]="opt.id">{{ opt.label }}</option>
        }
      </select>
    </label>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }
      .lj {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
      }
      .lj mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
        opacity: 0.7;
      }
      .lj select {
        appearance: auto;
        background: transparent;
        color: inherit;
        border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
        border-radius: 0.5rem;
        padding: 0.2rem 0.35rem;
        font: inherit;
        font-size: 0.8rem;
        cursor: pointer;
      }
      .lj select:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 1px;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class LocaleSwitcherComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly jurisdiction = inject(JurisdictionService);

  protected onLocale(value: string): void {
    this.i18n.setLocale(value as LocaleId);
  }

  protected onJurisdiction(value: string): void {
    this.jurisdiction.setJurisdiction(value as JurisdictionId);
  }
}
