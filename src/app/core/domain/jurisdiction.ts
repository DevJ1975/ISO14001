/**
 * Per-jurisdiction configuration (Trainovate-authored).
 *
 * A pure, dependency-free helper so it can be unit-tested in isolation and
 * reused by the Angular `JurisdictionService` (which adds signals + storage).
 *
 * The framing text below is original, jurisdiction-flavoured guidance authored
 * for this platform. It surfaces the locally-relevant regulator/term as a hint
 * in the compliance register — it never overwrites auditor-entered data, and it
 * contains no verbatim standard or statutory text.
 */

export type JurisdictionId = 'UK' | 'EU' | 'US' | 'AU' | 'OTHER';

/** First day of the week used by calendars/date pickers (0 = Sunday). */
export type FirstDayOfWeek = 0 | 1;

/** Measurement units a jurisdiction conventionally prefers. */
export type UnitSystem = 'metric' | 'imperial';

export interface JurisdictionConfig {
  readonly id: JurisdictionId;
  /** Short, human-readable name for menus. */
  readonly label: string;
  /** Token for `DatePipe` / `formatDate` (e.g. 'dd/MM/yyyy'). */
  readonly dateFormat: string;
  /** Token for the longer date variant used in headers/exports. */
  readonly longDateFormat: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly units: UnitSystem;
  /**
   * The regulator/term most auditors in this jurisdiction reference when
   * framing legal & other requirements. Used only as a default/hint.
   */
  readonly regulatorHint: string;
  /** One-line framing default for the compliance-obligations register. */
  readonly complianceFraming: string;
}

const CONFIGS: Record<JurisdictionId, JurisdictionConfig> = {
  UK: {
    id: 'UK',
    label: 'United Kingdom',
    dateFormat: 'dd/MM/yyyy',
    longDateFormat: 'd MMMM yyyy',
    firstDayOfWeek: 1,
    units: 'metric',
    regulatorHint: 'HSE (Health and Safety Executive)',
    complianceFraming:
      'Capture UK statutory duties and other requirements; reference the relevant HSE guidance or approved code where applicable.',
  },
  EU: {
    id: 'EU',
    label: 'European Union',
    dateFormat: 'dd/MM/yyyy',
    longDateFormat: 'd MMMM yyyy',
    firstDayOfWeek: 1,
    units: 'metric',
    regulatorHint: 'national competent authority (EU framework directives)',
    complianceFraming:
      'Capture obligations arising from transposed EU framework directives and the national competent authority that enforces them.',
  },
  US: {
    id: 'US',
    label: 'United States',
    dateFormat: 'MM/dd/yyyy',
    longDateFormat: 'MMMM d, yyyy',
    firstDayOfWeek: 0,
    units: 'imperial',
    regulatorHint: 'OSHA (Occupational Safety and Health Administration)',
    complianceFraming:
      'Capture federal and state OSHA requirements and any other applicable standards, with the citing authority noted.',
  },
  AU: {
    id: 'AU',
    label: 'Australia',
    dateFormat: 'dd/MM/yyyy',
    longDateFormat: 'd MMMM yyyy',
    firstDayOfWeek: 1,
    units: 'metric',
    regulatorHint: 'Safe Work Australia / state WHS regulator',
    complianceFraming:
      'Capture WHS Act and Regulation duties for the relevant state or territory, referencing the responsible WHS regulator.',
  },
  OTHER: {
    id: 'OTHER',
    label: 'Other / not set',
    dateFormat: 'yyyy-MM-dd',
    longDateFormat: 'd MMMM yyyy',
    firstDayOfWeek: 1,
    units: 'metric',
    complianceFraming:
      'Capture the applicable legal and other requirements and the authority that enforces them in your jurisdiction.',
    regulatorHint: 'your local occupational health & safety regulator',
  },
};

export const JURISDICTION_IDS: readonly JurisdictionId[] = ['UK', 'EU', 'US', 'AU', 'OTHER'];

export const DEFAULT_JURISDICTION: JurisdictionId = 'UK';

/** True when `value` is a recognised jurisdiction id. */
export function isJurisdictionId(value: unknown): value is JurisdictionId {
  return typeof value === 'string' && (JURISDICTION_IDS as readonly string[]).includes(value);
}

/**
 * Return the configuration for a jurisdiction. Unknown/missing ids fall back to
 * the default so callers always receive a usable config.
 */
export function jurisdictionConfig(id: unknown): JurisdictionConfig {
  return isJurisdictionId(id) ? CONFIGS[id] : CONFIGS[DEFAULT_JURISDICTION];
}

/** All configs in menu order (for building a switcher). */
export function allJurisdictions(): readonly JurisdictionConfig[] {
  return JURISDICTION_IDS.map((id) => CONFIGS[id]);
}
