/**
 * Statutory incident-form builders: the OSHA 300 Log, the OSHA 300A annual
 * summary, an OSHA 301-style per-incident report, and a RIDDOR-style report.
 *
 * These reuse the dependency-free `toCsv` serialiser so they are printable /
 * importable and work offline with no backend. The OSHA forms are U.S.
 * government public-domain instruments, so replicating their column structure is
 * fine; the RIDDOR builder uses Trainovate-authored field labels (clause and
 * regulation numbers are facts, and no verbatim ISO 45001 text appears).
 *
 * The builders are pure functions over the store `Incident` list, kept beside
 * the registers feature so the mappings stay unit-testable.
 */

import { type IncidentRates, cappedDays, computeIncidentRates, isRecordableCase } from '../../core/domain';
import { type CsvColumn, toCsv } from '../../core/export/csv';
import type { Incident } from '../../core/field/field-audit-store';

/** Map the internal case classification to the OSHA 300 Log column letter it lands in. */
function caseClassColumn(incident: Incident): 'G — Death' | 'H — Days away' | 'I — Restricted/transfer' | 'J — Other recordable' | '' {
  switch (incident.oshaCaseClassification) {
    case 'death':
      return 'G — Death';
    case 'daysAway':
      return 'H — Days away';
    case 'restrictedOrTransfer':
      return 'I — Restricted/transfer';
    case 'otherRecordable':
      return 'J — Other recordable';
    default:
      return '';
  }
}

/** Map the internal incident type to the OSHA 300 Log "type of illness" injury/illness split. */
function injuryOrIllness(incident: Incident): 'Injury' | 'Illness' {
  return incident.incidentType === 'illHealth' ? 'Illness' : 'Injury';
}

/**
 * On a privacy-concern case (OSHA 1904.29(b)) the employee name is withheld from
 * the 300 Log. We have no separate employee-name field, so the case title is the
 * identifying text; redact it to the standard "Privacy case" placeholder.
 */
function logIdentifier(incident: Incident): string {
  return incident.privacyConcern ? 'Privacy case' : incident.title;
}

/** OSHA 300 Log columns — one row per recordable case. */
export const osha300LogColumns: CsvColumn<Incident>[] = [
  { header: 'Case no.', value: (r) => r.reference },
  { header: "Employee / job title", value: (r) => logIdentifier(r) },
  { header: 'Date of injury/onset', value: (r) => r.occurredAt },
  { header: 'Where the event occurred', value: (r) => r.location },
  { header: 'Describe injury/illness, parts of body, object/substance', value: (r) => describeForLog(r) },
  { header: 'Injury / illness', value: (r) => injuryOrIllness(r) },
  { header: 'Classify the case (G/H/I/J)', value: (r) => caseClassColumn(r) },
  { header: 'Days away (K)', value: (r) => cappedDays(r.daysAway) || '' },
  { header: 'Days restricted/transferred (L)', value: (r) => cappedDays(r.daysRestricted) || '' },
];

/** Compose the OSHA 300 "describe" cell from the injury, body part and agency. */
function describeForLog(incident: Incident): string {
  return [incident.description, incident.bodyPart ? `Body part: ${incident.bodyPart}` : '', incident.agency ? `Object/substance: ${incident.agency}` : '']
    .filter((part) => part && part.trim())
    .join('; ');
}

/** Only recordable cases appear on the 300 Log. */
export function recordableIncidents(incidents: readonly Incident[]): Incident[] {
  return incidents.filter((incident) => isRecordableCase(incident));
}

/** Build the OSHA 300 Log CSV (recordable cases only). */
export function buildOsha300Log(incidents: readonly Incident[]): string {
  return toCsv(recordableIncidents(incidents), osha300LogColumns);
}

/** A single labelled field in the OSHA 300A summary totals block. */
export interface Osha300ASummaryRow {
  label: string;
  value: number;
}

/**
 * Build the OSHA 300A annual-summary totals. Counts cases by classification and
 * sums the (180-capped) day totals — the figures an employer posts each year.
 */
export function buildOsha300ASummary(incidents: readonly Incident[]): Osha300ASummaryRow[] {
  const recordable = recordableIncidents(incidents);
  const countClass = (cls: Incident['oshaCaseClassification']): number =>
    recordable.filter((incident) => incident.oshaCaseClassification === cls).length;
  const totalDaysAway = recordable.reduce((sum, incident) => sum + cappedDays(incident.daysAway), 0);
  const totalDaysRestricted = recordable.reduce((sum, incident) => sum + cappedDays(incident.daysRestricted), 0);
  return [
    { label: 'Total deaths (G)', value: countClass('death') },
    { label: 'Total cases with days away from work (H)', value: countClass('daysAway') },
    { label: 'Total cases with job transfer or restriction (I)', value: countClass('restrictedOrTransfer') },
    { label: 'Total other recordable cases (J)', value: countClass('otherRecordable') },
    { label: 'Total days away from work (K)', value: totalDaysAway },
    { label: 'Total days of job transfer or restriction (L)', value: totalDaysRestricted },
    { label: 'Total recordable cases', value: recordable.length },
    { label: 'Total injuries', value: recordable.filter((i) => injuryOrIllness(i) === 'Injury').length },
    { label: 'Total illnesses', value: recordable.filter((i) => injuryOrIllness(i) === 'Illness').length },
  ];
}

const summaryColumns: CsvColumn<Osha300ASummaryRow>[] = [
  { header: 'Summary item', value: (r) => r.label },
  { header: 'Total', value: (r) => r.value },
];

/** Build the OSHA 300A annual-summary CSV, optionally appending the computed rates. */
export function buildOsha300ASummaryCsv(incidents: readonly Incident[], hoursWorked?: number): string {
  const rows = buildOsha300ASummary(incidents);
  if (typeof hoursWorked === 'number' && hoursWorked > 0) {
    const rates: IncidentRates = computeIncidentRates(incidents, hoursWorked);
    rows.push(
      { label: 'Total hours worked', value: rates.hoursWorked },
      { label: 'TRIR (per 200,000 h)', value: rates.trir },
      { label: 'DART rate (per 200,000 h)', value: rates.dartRate },
    );
  }
  return toCsv(rows, summaryColumns);
}

/** One field/value pair in a per-incident report (OSHA 301 / RIDDOR layout). */
export interface IncidentFormField {
  field: string;
  value: string;
}

const formColumns: CsvColumn<IncidentFormField>[] = [
  { header: 'Field', value: (r) => r.field },
  { header: 'Value', value: (r) => r.value },
];

function text(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Build an OSHA 301-style "Injury and Illness Incident Report" for one incident:
 * the per-case companion to the 300 Log, capturing the person, the event and how
 * it happened. Field/value rows so it is printable and importable.
 */
export function buildOsha301Report(incident: Incident): IncidentFormField[] {
  return [
    { field: 'Case number', value: text(incident.reference) },
    { field: 'Employee / job title', value: text(logIdentifier(incident)) },
    { field: 'People involved / witnesses', value: text(incident.privacyConcern ? 'Withheld (privacy case)' : incident.peopleInvolved) },
    { field: 'Date of injury or illness', value: text(incident.occurredAt) },
    { field: 'Date reported', value: text(incident.reportedAt) },
    { field: 'Where the event occurred', value: text(incident.location) },
    { field: 'What happened', value: text(incident.description) },
    { field: 'Injury or illness, and part of body', value: text([incident.injuryClassification, incident.bodyPart].filter(Boolean).join(' — ')) },
    { field: 'Object or substance that directly harmed the employee', value: text(incident.agency) },
    { field: 'Recordable', value: text(incident.oshaRecordable) },
    { field: 'Case classification', value: text(caseClassColumn(incident)) },
    { field: 'Days away from work', value: text(cappedDays(incident.daysAway)) },
    { field: 'Days restricted or transferred', value: text(cappedDays(incident.daysRestricted)) },
    { field: 'Immediate action / containment', value: text(incident.immediateAction) },
    { field: 'Investigation method', value: text(incident.investigationMethod) },
    { field: 'Investigator', value: text(incident.investigator) },
    { field: 'Contributing factors', value: text(incident.contributingFactors) },
    { field: 'Investigation findings', value: text(incident.investigationFindings) },
    { field: 'Worker participation in evaluating the action', value: text(incident.workerParticipation) },
    { field: 'Verified effective', value: text(incident.verifiedEffective) },
    { field: 'Status', value: text(incident.status) },
  ];
}

/** Build the OSHA 301 report as CSV for one incident. */
export function buildOsha301ReportCsv(incident: Incident): string {
  return toCsv(buildOsha301Report(incident), formColumns);
}

/**
 * Build a RIDDOR-style report for one incident (Trainovate-authored labels): the
 * UK companion capturing the reportable event, who it affected and the regulator
 * submission tracking.
 */
export function buildRiddorReport(incident: Incident): IncidentFormField[] {
  return [
    { field: 'Internal reference', value: text(incident.reference) },
    { field: 'Date of the incident', value: text(incident.occurredAt) },
    { field: 'Date reported internally', value: text(incident.reportedAt) },
    { field: 'Location / site', value: text(incident.location) },
    { field: 'Kind of incident', value: text(incident.incidentType) },
    { field: 'Injury classification', value: text(incident.injuryClassification) },
    { field: 'Part of body affected', value: text(incident.bodyPart) },
    { field: 'People involved / witnesses', value: text(incident.peopleInvolved) },
    { field: 'What happened', value: text(incident.description) },
    { field: 'Immediate action taken', value: text(incident.immediateAction) },
    { field: 'Reportable to the regulator', value: text(incident.reportableToRegulator) },
    { field: 'Date reported to the regulator', value: text(incident.reportedToRegulatorAt) },
    { field: 'Regulator reference', value: text(incident.regulatorReference) },
    { field: 'Reporting channel', value: text(incident.reportingChannel) },
    { field: 'Root cause', value: text(incident.rootCause) },
    { field: 'Worker participation in evaluating the action', value: text(incident.workerParticipation) },
    { field: 'Status', value: text(incident.status) },
  ];
}

/** Build the RIDDOR-style report as CSV for one incident. */
export function buildRiddorReportCsv(incident: Incident): string {
  return toCsv(buildRiddorReport(incident), formColumns);
}
