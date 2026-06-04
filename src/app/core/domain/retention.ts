/**
 * Records retention & legal-hold policy — a data-governance view that, for the
 * current audit, computes a per-record-category retention status: a configurable
 * retention period, a derived "retain until" date measured from the audit/report
 * date, an optional legal hold that overrides disposal, and a disposition status.
 *
 * The math lives here as a PURE, JSON-serialisable function so it can be
 * unit-tested offline and reproduced deterministically (mirrors the
 * report-draft / portfolio-analytics domain-module pattern). No I/O, no store,
 * no DOM access.
 *
 * The retention periods and the review window are Trainovate-authored defaults,
 * clearly labelled as configurable — they are a sensible starting point a
 * certification body tunes to its own accreditation/contractual obligations, not
 * a transcription of any standard. Clause references are identifiers / short
 * titles only (copyright guardrail).
 */

/** Stable identifiers for the record categories a certification body retains. */
export type RetentionCategoryId =
  | 'auditReport'
  | 'workingPapers'
  | 'findingsCapa'
  | 'evidenceIndex'
  | 'competenceRecords'
  | 'programmeRecords';

/**
 * Derived disposition status for a category:
 * - `active`          — retain-until is comfortably in the future.
 * - `dueForReview`    — retain-until falls within the review window (approaching).
 * - `eligibleForDisposal` — retain-until has passed; the record may be disposed.
 * - `onLegalHold`     — a legal hold is in force; disposal is suspended regardless of dates.
 */
export type RetentionDisposition = 'active' | 'dueForReview' | 'eligibleForDisposal' | 'onLegalHold';

/** A Trainovate-authored category definition: default period + reference note. */
export interface RetentionCategoryDef {
  readonly id: RetentionCategoryId;
  /** Human label for the record category. */
  readonly label: string;
  /** Default retention period in whole years (configurable per certification body). */
  readonly defaultYears: number;
  /** Clause identifier / short title only — no verbatim requirement text. */
  readonly reference: string;
}

/**
 * Trainovate-authored, generic default catalogue of retained record categories.
 * The six-year default for certification records is a common starting point
 * (e.g. aligned to a typical certification + recertification cycle); every value
 * here is configurable. Exported so the UI can show the catalogue and so callers
 * can clone-and-tune it.
 */
export const DEFAULT_RETENTION_CATEGORIES: readonly RetentionCategoryDef[] = [
  { id: 'auditReport', label: 'Audit report & conclusion', defaultYears: 6, reference: 'cl. 7.5 — documented information' },
  { id: 'workingPapers', label: 'Working papers', defaultYears: 6, reference: 'cl. 9.2 — internal audit records' },
  { id: 'findingsCapa', label: 'Findings & CAPA records', defaultYears: 6, reference: 'cl. 10.2 — nonconformity & corrective action' },
  { id: 'evidenceIndex', label: 'Evidence index', defaultYears: 6, reference: 'cl. 9.1 — monitoring evidence' },
  { id: 'competenceRecords', label: 'Competence records', defaultYears: 6, reference: 'cl. 7.2 — competence' },
  { id: 'programmeRecords', label: 'Programme records', defaultYears: 3, reference: 'cl. 9.2 — audit programme' },
];

/** Trainovate-authored default review window: flag categories whose retain-until is within this many days. */
export const DEFAULT_REVIEW_WINDOW_DAYS = 180;

export interface RetentionInput {
  /**
   * The base date retention is measured from (ISO). The retain-until date is
   * `baseDate + retentionYears`. Typically the report sign-off date, falling
   * back to the audit end date or creation date. When absent/unparseable the
   * computation is skipped and a flag is surfaced.
   */
  baseDate?: string;
  /**
   * Per-category overrides keyed by category id. `years` overrides the default
   * retention period; `legalHold` suspends disposal for that category.
   */
  overrides?: Partial<Record<RetentionCategoryId, RetentionCategoryOverride>>;
  /** Catalogue of categories to compute over; defaults to {@link DEFAULT_RETENTION_CATEGORIES}. */
  categories?: readonly RetentionCategoryDef[];
  /** Review-window threshold in days; defaults to {@link DEFAULT_REVIEW_WINDOW_DAYS}. */
  reviewWindowDays?: number;
}

export interface RetentionCategoryOverride {
  /** Overridden retention period in whole years (configurable). */
  readonly years?: number;
  /** When true, a legal hold suspends disposal for this category. */
  readonly legalHold?: boolean;
}

/** Computed per-category retention record. JSON-serialisable. */
export interface RetentionRecord {
  readonly id: RetentionCategoryId;
  readonly label: string;
  readonly reference: string;
  /** Effective retention period in years after applying any override. */
  readonly retentionYears: number;
  /** True when the period came from an override rather than the catalogue default. */
  readonly customised: boolean;
  /** Whether a legal hold is in force for this category. */
  readonly legalHold: boolean;
  /** Retain-until date (ISO), or null when the base date is missing/unparseable. */
  readonly retainUntil: string | null;
  /** Whole days from `now` to `retainUntil` (negative once elapsed); null when undated. */
  readonly daysRemaining: number | null;
  readonly disposition: RetentionDisposition;
}

export interface RetentionSummary {
  readonly generatedAt: string;
  /** The resolved base date used for the math (ISO), or null when none was usable. */
  readonly baseDate: string | null;
  /** True when no usable base date was provided — retain-until dates are unknown. */
  readonly baseDateMissing: boolean;
  readonly reviewWindowDays: number;
  readonly records: readonly RetentionRecord[];
  /** Count of categories eligible for disposal (legal holds excluded). */
  readonly eligibleForDisposalCount: number;
  /** Count of categories due for review within the window. */
  readonly dueForReviewCount: number;
  /** Count of categories currently on legal hold. */
  readonly onLegalHoldCount: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse an ISO date to epoch ms, or null when absent/unparseable. */
function parseMs(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Add a whole number of years to an epoch timestamp using UTC calendar fields,
 * so e.g. a base on 29 Feb lands on 28 Feb in a non-leap target year rather than
 * rolling into March. Deterministic and timezone-independent.
 */
function addYearsUtc(baseMs: number, years: number): number {
  const d = new Date(baseMs);
  const targetYear = d.getUTCFullYear() + years;
  const result = new Date(
    Date.UTC(
      targetYear,
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  // Guard the 29 Feb → 28 Feb case: if the month rolled forward, clamp to last day of intended month.
  if (result.getUTCMonth() !== d.getUTCMonth()) {
    result.setUTCDate(0);
  }
  return result.getTime();
}

/**
 * Compute per-category retention status for the current audit. Pure and
 * deterministic: given the same input (and `now`) it returns the same result.
 * Empty/edge inputs are safe — a missing base date yields null retain-until
 * dates and an `active` disposition (or `onLegalHold` where a hold is set).
 */
export function computeRetention(input: RetentionInput, now: string = new Date().toISOString()): RetentionSummary {
  const nowMs = parseMs(now) ?? Date.now();
  const generatedAt = new Date(nowMs).toISOString();

  const categories = input.categories ?? DEFAULT_RETENTION_CATEGORIES;
  const reviewWindowDays = Math.max(0, input.reviewWindowDays ?? DEFAULT_REVIEW_WINDOW_DAYS);
  const overrides = input.overrides ?? {};

  const baseMs = parseMs(input.baseDate);
  const baseDateMissing = baseMs === null;

  const records: RetentionRecord[] = categories.map((cat) => {
    const override = overrides[cat.id];
    const hasYearsOverride = typeof override?.years === 'number' && Number.isFinite(override.years);
    const retentionYears = hasYearsOverride ? Math.max(0, override!.years!) : cat.defaultYears;
    const legalHold = override?.legalHold === true;

    let retainUntil: string | null = null;
    let daysRemaining: number | null = null;
    if (baseMs !== null) {
      const untilMs = addYearsUtc(baseMs, retentionYears);
      retainUntil = new Date(untilMs).toISOString();
      daysRemaining = Math.floor((untilMs - nowMs) / MS_PER_DAY);
    }

    let disposition: RetentionDisposition;
    if (legalHold) {
      disposition = 'onLegalHold';
    } else if (daysRemaining === null) {
      // No base date: cannot date disposal, treat as still active.
      disposition = 'active';
    } else if (daysRemaining < 0) {
      disposition = 'eligibleForDisposal';
    } else if (daysRemaining <= reviewWindowDays) {
      disposition = 'dueForReview';
    } else {
      disposition = 'active';
    }

    return {
      id: cat.id,
      label: cat.label,
      reference: cat.reference,
      retentionYears,
      customised: hasYearsOverride && retentionYears !== cat.defaultYears,
      legalHold,
      retainUntil,
      daysRemaining,
      disposition,
    };
  });

  return {
    generatedAt,
    baseDate: baseMs === null ? null : new Date(baseMs).toISOString(),
    baseDateMissing,
    reviewWindowDays,
    records,
    eligibleForDisposalCount: records.filter((r) => r.disposition === 'eligibleForDisposal').length,
    dueForReviewCount: records.filter((r) => r.disposition === 'dueForReview').length,
    onLegalHoldCount: records.filter((r) => r.disposition === 'onLegalHold').length,
  };
}
