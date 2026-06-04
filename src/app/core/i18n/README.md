# Runtime i18n + per-jurisdiction configuration

A lightweight, **runtime** internationalization layer that fits this signals-based
app. Angular's compile-time `$localize`/i18n is deliberately *not* used because the
app wants instant locale switching without a rebuild or per-locale bundle.

## Pieces

| File | Responsibility |
| --- | --- |
| `i18n.service.ts` | Signal-backed active locale (`locale`), `t(key, params?)` lookup, localStorage persistence (`trainovate-locale`). Mirrors `core/theme/theme.service.ts`. |
| `translate.pipe.ts` | Impure `t` pipe — `{{ 'nav.overview' \| t }}`. Reads the locale signal so OnPush components re-render on switch. |
| `locale-switcher.component.ts` | Accessible header control to pick locale + jurisdiction. |
| `locales/en.ts` | **Source of truth.** All keys + English copy. `MessageKey` is derived from it, so every other catalog and every `t()` call is type-checked. |
| `locales/fr.ts` | A `Partial<MessageCatalog>`; missing keys fall back to English per-key. |
| `../jurisdiction/jurisdiction.service.ts` + `../domain/jurisdiction.ts` | Signal-backed jurisdiction selection driving date/number formatting + compliance-register framing. The pure config lives in `domain` and is unit-tested. |

## How lookup + fallback works

`translateKey(locale, key, params)` (pure, exported, unit-tested) resolves:

1. the value in the requested locale's catalog, else
2. the English value, else
3. the raw key (so a typo is visible, never a crash).

`{name}` placeholders are interpolated from `params`.

## Adding a translatable string

1. Add the key + English copy to `locales/en.ts` (this also extends `MessageKey`).
2. Mirror the key in `locales/fr.ts` (optional — English is the fallback).
3. In templates: `{{ 'area.key' | t }}` (import `TranslatePipe`).
   In component TS: inject `I18nService` and call `this.i18n.t('area.key')`.

## Adding a locale

1. Create `locales/<id>.ts` exporting a `Partial<MessageCatalog>`.
2. Register it in `CATALOGS` and `LOCALE_OPTIONS` (and the `LocaleId` union) in
   `i18n.service.ts`.

## Translation coverage (current)

Converted to the i18n pattern:

- **Shell** — nav labels (via `NAV_DESTINATIONS.labelKey`), source/connection
  badge + hints, header control aria-labels (search, tour, theme, sign out),
  language + jurisdiction switcher.
- **Common action words** — Save / Add / Remove / Cancel / Export / Close /
  Search.
- **Login screen** — headings, field labels, validation messages, sign-in /
  SSO / demo buttons.
- **Registers** — compliance tab "Add" + jurisdiction framing hint.

Everything else keeps its existing English literals and works unchanged
(strictly additive). Extend per feature by following "Adding a translatable
string" above.

## Per-jurisdiction configuration

`core/domain/jurisdiction.ts` returns a typed `JurisdictionConfig` per
jurisdiction (UK / EU / US / AU / Other): date formats, first-day-of-week,
units, and Trainovate-authored compliance framing/regulator hints. The framing
text surfaces as a **default/hint** in the compliance register and never
overwrites auditor-entered data. The copy is original and contains no verbatim
standard or statutory text.
