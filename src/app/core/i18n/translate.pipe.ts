import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from './i18n.service';
import type { MessageKey } from './locales/en';

/**
 * Template translation pipe: `{{ 'nav.overview' | t }}`.
 *
 * Reads the active-locale signal inside `transform`, so OnPush components
 * re-render automatically when the locale changes (the signal read registers a
 * dependency in the template's reactive context). Kept impure for that reason.
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
    return this.i18n.t(key, params);
  }
}
