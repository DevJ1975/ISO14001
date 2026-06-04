import { Injectable, computed, signal } from '@angular/core';

import { en, type MessageCatalog, type MessageKey } from './locales/en';
import { fr } from './locales/fr';

/** Supported runtime locales. English is always the default + fallback. */
export type LocaleId = 'en' | 'fr';

export interface LocaleOption {
  readonly id: LocaleId;
  /** Native label for the switcher (e.g. "Français"). */
  readonly label: string;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
];

export const DEFAULT_LOCALE: LocaleId = 'en';

const STORAGE_KEY = 'trainovate-locale';

/**
 * Catalogs by locale. English is the complete source-of-truth; other locales
 * are partial and fall back to English per-key.
 */
const CATALOGS: Record<LocaleId, Partial<MessageCatalog>> = {
  en,
  fr,
};

/**
 * Resolve a single key against a catalog, falling back to English, then to the
 * raw key. Pure so it can be unit-tested without Angular. `params` substitutes
 * `{name}` placeholders.
 */
export function translateKey(
  locale: LocaleId,
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const fromLocale = CATALOGS[locale]?.[key];
  const template = fromLocale ?? en[key] ?? key;
  return params ? interpolate(template, params) : template;
}

function interpolate(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** True when `value` is a supported locale id. */
export function isLocaleId(value: unknown): value is LocaleId {
  return value === 'en' || value === 'fr';
}

/**
 * Runtime, signal-backed translation service. Mirrors the localStorage idiom of
 * `ThemeService`. Components read `t(key)` (or the `t` pipe) and re-render
 * reactively when the locale changes.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<LocaleId>(this.readLocale());

  /** Locale-tagged language code for `Intl` / `DatePipe` (e.g. 'en-GB'). */
  readonly intlLocale = computed(() => (this.locale() === 'fr' ? 'fr-FR' : 'en-GB'));

  readonly options: readonly LocaleOption[] = LOCALE_OPTIONS;

  /** Look up a message, applying the active locale and optional placeholders. */
  t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
    return translateKey(this.locale(), key, params);
  }

  setLocale(locale: LocaleId): void {
    if (!isLocaleId(locale)) return;
    this.locale.set(locale);
    this.saveLocale();
  }

  private readLocale(): LocaleId {
    if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocaleId(stored) ? stored : DEFAULT_LOCALE;
  }

  private saveLocale(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, this.locale());
    }
  }
}
