/**
 * OH&S incident analytics & statutory-reporting helpers (Trainovate-authored).
 *
 * Pure, dependency-free and unit-tested so the same logic backs the analytics
 * dashboard, the incident register and the statutory-form exports without any
 * Angular or backend coupling. All wording here is original; clause/regulation
 * numbers are facts, and no text reproduces verbatim ISO 45001 requirement
 * language (copyright guardrail).
 *
 * Two regulatory frames are modelled:
 *  - OSHA (US): recordable-case rates use the federal 200,000-hour base
 *    (100 full-time-equivalent workers × 2,000 hours), and reporting deadlines
 *    follow 29 CFR 1904.39.
 *  - RIDDOR (UK): the lost-time-injury frequency rate uses the 1,000,000-hour
 *    base common in UK practice, and reporting expectations follow RIDDOR 2013.
 */

import type { JurisdictionId } from './jurisdiction.js';

/** The federal base hours OSHA incidence rates are normalised to (1904.32). */
export const OSHA_RATE_BASE_HOURS = 200_000;
/** The base hours the UK lost-time-injury frequency rate is normalised to. */
export const LTIFR_BASE_HOURS = 1_000_000;
/** OSHA caps the days-away and days-restricted counts on the 300 Log at 180 each. */
export const OSHA_DAY_COUNT_CAP = 180;

/** Minimal incident shape the metric helpers read — a structural subset of the store `Incident`. */
export interface IncidentMetricInput {
  incidentType?: string;
  injuryClassification?: string;
  oshaRecordable?: boolean;
  oshaCaseClassification?: 'death' | 'daysAway' | 'restrictedOrTransfer' | 'otherRecordable';
  daysAway?: number;
  daysRestricted?: number;
}

/** The computed safety-performance rates, plus the underlying case counts. */
export interface IncidentRates {
  /** Hours worked over the period the rates are computed against. */
  hoursWorked: number;
  /** Recordable cases (OSHA 300 Log entries). */
  recordableCases: number;
  /** DART cases — days away, restricted or transferred. */
  dartCases: number;
  /** Lost-time cases (days away from work, or a lost-time injury classification). */
  lostTimeCases: number;
  /** Total days away from work across all cases (each capped at 180). */
  totalDaysAway: number;
  /** Total days restricted/transferred across all cases (each capped at 180). */
  totalDaysRestricted: number;
  /** Total recordable incident rate = recordable × 200,000 / hours. */
  trir: number;
  /** DART rate = DART cases × 200,000 / hours. */
  dartRate: number;
  /** Lost-time injury frequency rate = lost-time cases × 1,000,000 / hours. */
  ltifr: number;
  /** Severity rate = total days away × 200,000 / hours. */
  severityRate: number;
}

/** Clamp a day count to a non-negative integer no larger than the OSHA 180-day cap. */
export function cappedDays(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(OSHA_DAY_COUNT_CAP, Math.floor(value));
}

/** True when the incident counts as a recordable case (explicit flag, or a recordable case class). */
export function isRecordableCase(incident: IncidentMetricInput): boolean {
  if (incident.oshaRecordable === true) return true;
  // A case classification other than "not recordable" implies recordability even
  // if the boolean was left unset, so the rates stay consistent with the 300 Log.
  return incident.oshaCaseClassification != null;
}

/** True when the incident counts toward DART (days away, restricted or transferred). */
export function isDartCase(incident: IncidentMetricInput): boolean {
  if (cappedDays(incident.daysAway) > 0 || cappedDays(incident.daysRestricted) > 0) return true;
  return (
    incident.oshaCaseClassification === 'death' ||
    incident.oshaCaseClassification === 'daysAway' ||
    incident.oshaCaseClassification === 'restrictedOrTransfer'
  );
}

/** True when the incident counts as a lost-time case (days away, or a lost-time/RIDDOR injury class). */
export function isLostTimeCase(incident: IncidentMetricInput): boolean {
  if (cappedDays(incident.daysAway) > 0) return true;
  if (incident.oshaCaseClassification === 'death' || incident.oshaCaseClassification === 'daysAway') return true;
  return incident.injuryClassification === 'lostTime' || incident.injuryClassification === 'riddor';
}

/** Round a rate to two decimals (the convention safety scorecards present). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute the standard safety-performance rates from a list of incidents and the
 * hours worked over the same period. Zero/negative/invalid hours yield zero
 * rates (never NaN/Infinity) so the dashboard degrades gracefully before hours
 * are entered. Counts are always returned so the UI can show the numerators.
 */
export function computeIncidentRates(
  incidents: readonly IncidentMetricInput[],
  hoursWorked: number,
): IncidentRates {
  let recordableCases = 0;
  let dartCases = 0;
  let lostTimeCases = 0;
  let totalDaysAway = 0;
  let totalDaysRestricted = 0;

  for (const incident of incidents) {
    if (isRecordableCase(incident)) recordableCases += 1;
    if (isDartCase(incident)) dartCases += 1;
    if (isLostTimeCase(incident)) lostTimeCases += 1;
    totalDaysAway += cappedDays(incident.daysAway);
    totalDaysRestricted += cappedDays(incident.daysRestricted);
  }

  const hours = Number.isFinite(hoursWorked) && hoursWorked > 0 ? hoursWorked : 0;
  const rate = (numerator: number, base: number): number =>
    hours > 0 ? round2((numerator * base) / hours) : 0;

  return {
    hoursWorked: hours,
    recordableCases,
    dartCases,
    lostTimeCases,
    totalDaysAway,
    totalDaysRestricted,
    trir: rate(recordableCases, OSHA_RATE_BASE_HOURS),
    dartRate: rate(dartCases, OSHA_RATE_BASE_HOURS),
    ltifr: rate(lostTimeCases, LTIFR_BASE_HOURS),
    severityRate: rate(totalDaysAway, OSHA_RATE_BASE_HOURS),
  };
}

/**
 * Build a human-readable incident reference like `INC-2026-001` from a year and
 * a sequence number. Pure so the store and tests share one format. The sequence
 * is zero-padded to at least three digits and never less than 1.
 */
export function formatIncidentReference(year: number, sequence: number): string {
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear();
  const safeSeq = Math.max(1, Number.isFinite(sequence) ? Math.trunc(sequence) : 1);
  return `INC-${safeYear}-${String(safeSeq).padStart(3, '0')}`;
}

/**
 * Compute the next incident reference given the references already in use. Reads
 * the trailing sequence of any `INC-<year>-<n>` already issued for the year and
 * returns the next free number, so deleting/reordering rows never reuses an id.
 */
export function nextIncidentReference(
  existingReferences: readonly (string | undefined)[],
  now: Date = new Date(),
): string {
  const year = now.getFullYear();
  const prefix = `INC-${year}-`;
  let max = 0;
  for (const ref of existingReferences) {
    if (!ref || !ref.startsWith(prefix)) continue;
    const tail = Number(ref.slice(prefix.length));
    if (Number.isFinite(tail) && tail > max) max = Math.trunc(tail);
  }
  return formatIncidentReference(year, max + 1);
}

// --- Statutory reporting deadlines ------------------------------------------

/** A reporting-deadline determination for an incident in a given jurisdiction. */
export interface ReportingDeadline {
  /** Whether the event is reportable to the regulator at all. */
  reportable: boolean;
  /** The regulator the report goes to (OSHA / HSE-RIDDOR / generic), for labelling. */
  regulator: 'OSHA' | 'RIDDOR' | 'regulator' | null;
  /** Maximum hours from occurrence to submit, when a fixed window applies (e.g. 8 or 24). */
  windowHours?: number;
  /** True when the event is to be reported without delay rather than within a fixed window. */
  withoutDelay?: boolean;
  /** The absolute deadline timestamp (ISO), when both an occurrence date and a window are known. */
  dueAt?: string;
  /** A short, plain-language basis for the determination (Trainovate-authored). */
  basis: string;
}

/** Inputs the deadline helper reads from an incident. */
export interface ReportingDeadlineInput {
  incidentType?: string;
  injuryClassification?: string;
  oshaCaseClassification?: 'death' | 'daysAway' | 'restrictedOrTransfer' | 'otherRecordable';
  reportableToRegulator?: boolean;
  occurredAt?: string;
}

function addHoursIso(occurredAt: string | undefined, hours: number): string | undefined {
  if (!occurredAt) return undefined;
  const base = new Date(occurredAt);
  if (Number.isNaN(base.getTime())) return undefined;
  return new Date(base.getTime() + hours * 3_600_000).toISOString();
}

/**
 * Determine any statutory reporting deadline for an incident, by jurisdiction.
 *
 * US / OSHA (29 CFR 1904.39): a work-related fatality is reportable within
 * 8 hours; an in-patient hospitalization, an amputation, or the loss of an eye
 * is reportable within 24 hours.
 *
 * UK / RIDDOR (2013): deaths and the specified injuries are reported without
 * delay (and confirmed in writing within the statutory period); other reportable
 * cases (e.g. over-7-day incapacitation) are reported within the statutory
 * window, modelled here as 24 hours of awareness for surfacing purposes.
 *
 * Other jurisdictions fall back to a generic "reportable to regulator" signal
 * driven only by the auditor's reportable flag. Pure & deterministic.
 */
export function reportingDeadline(
  incident: ReportingDeadlineInput,
  jurisdiction: JurisdictionId,
): ReportingDeadline {
  const occurredAt = incident.occurredAt;

  if (jurisdiction === 'US') {
    const isFatality = incident.incidentType === 'fatality' || incident.oshaCaseClassification === 'death';
    if (isFatality) {
      return {
        reportable: true,
        regulator: 'OSHA',
        windowHours: 8,
        dueAt: addHoursIso(occurredAt, 8),
        basis: 'OSHA 1904.39 — a work-related fatality is reported within 8 hours.',
      };
    }
    // Severe injuries (in-patient hospitalization, amputation, loss of an eye).
    const isSevere =
      incident.reportableToRegulator === true ||
      incident.oshaCaseClassification === 'daysAway' ||
      incident.oshaCaseClassification === 'restrictedOrTransfer';
    if (isSevere) {
      return {
        reportable: true,
        regulator: 'OSHA',
        windowHours: 24,
        dueAt: addHoursIso(occurredAt, 24),
        basis:
          'OSHA 1904.39 — an in-patient hospitalization, amputation, or loss of an eye is reported within 24 hours.',
      };
    }
    return {
      reportable: false,
      regulator: 'OSHA',
      basis: 'Not a fatality or a severe injury triggering an OSHA report within a fixed window.',
    };
  }

  if (jurisdiction === 'UK') {
    const isFatalOrSpecified =
      incident.incidentType === 'fatality' ||
      incident.incidentType === 'dangerousOccurrence' ||
      incident.injuryClassification === 'riddor';
    if (isFatalOrSpecified) {
      return {
        reportable: true,
        regulator: 'RIDDOR',
        withoutDelay: true,
        basis:
          'RIDDOR — deaths, specified injuries and dangerous occurrences are reported without delay, then confirmed in writing within the statutory period.',
      };
    }
    if (incident.reportableToRegulator === true) {
      return {
        reportable: true,
        regulator: 'RIDDOR',
        windowHours: 24,
        dueAt: addHoursIso(occurredAt, 24),
        basis: 'RIDDOR — other reportable cases are notified within the statutory window.',
      };
    }
    return {
      reportable: false,
      regulator: 'RIDDOR',
      basis: 'Not flagged as a RIDDOR-reportable event.',
    };
  }

  // EU / AU / OTHER: surface a generic reportable signal from the auditor flag only.
  if (incident.reportableToRegulator === true) {
    return {
      reportable: true,
      regulator: 'regulator',
      basis: 'Flagged as reportable to the local occupational health & safety regulator.',
    };
  }
  return { reportable: false, regulator: null, basis: 'Not flagged as reportable to a regulator.' };
}

/** Status of a reportable incident's regulator submission, for alerting. */
export type RegulatorSubmissionStatus = 'notReportable' | 'submitted' | 'pending' | 'overdue';

/** Inputs for evaluating whether a regulator submission is missing or overdue. */
export interface RegulatorSubmissionInput extends ReportingDeadlineInput {
  /** Date the report was submitted to the regulator, if it has been. */
  reportedToRegulatorAt?: string;
}

/**
 * Classify a reportable incident's regulator-submission state at time `now`:
 * already submitted, still pending within its window, or overdue (past a fixed
 * window, or "without delay" with no submission recorded). Non-reportable
 * incidents return `notReportable`. Pure & deterministic.
 */
export function regulatorSubmissionStatus(
  incident: RegulatorSubmissionInput,
  jurisdiction: JurisdictionId,
  now: Date = new Date(),
): RegulatorSubmissionStatus {
  const deadline = reportingDeadline(incident, jurisdiction);
  if (!deadline.reportable) return 'notReportable';
  if (incident.reportedToRegulatorAt && incident.reportedToRegulatorAt.trim() !== '') return 'submitted';
  // "Without delay" cases are treated as overdue the moment they are logged
  // unsubmitted, since there is no grace window to sit inside.
  if (deadline.withoutDelay) return 'overdue';
  if (deadline.dueAt && new Date(deadline.dueAt).getTime() < now.getTime()) return 'overdue';
  return 'pending';
}
