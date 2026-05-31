import { emissionTco2e, formatTco2e } from '../../core/domain';
import { CsvColumn } from '../../core/export/csv';
import type {
  CalibrationRecord,
  CarbonEntry,
  DocumentedInfoRecord,
  EnvironmentalIncident,
  ManagementOfChangeRecord,
  Permit,
  SupplierRecord,
  TrainingRecord,
} from '../../core/field/field-audit-store';

/**
 * Column specifications for exporting each register to CSV. Kept beside the
 * registers feature (not in the component) so the mappings are unit-testable and
 * the component just wires the active tab to a spec. Only the structured,
 * high-value registers are exportable; free-text registers fall back to none.
 */
export const calibrationColumns: CsvColumn<CalibrationRecord>[] = [
  { header: 'Equipment', value: (r) => r.equipment },
  { header: 'Asset/serial', value: (r) => r.identifier },
  { header: 'Measures', value: (r) => r.parameter },
  { header: 'Last calibrated', value: (r) => r.lastCalibratedAt },
  { header: 'Next due', value: (r) => r.nextDueAt },
  { header: 'Frequency (months)', value: (r) => r.frequencyMonths },
  { header: 'Out of service', value: (r) => (r.outOfService ? 'yes' : 'no') },
  { header: 'Result', value: (r) => r.result },
];

export const trainingColumns: CsvColumn<TrainingRecord>[] = [
  { header: 'Person', value: (r) => r.person },
  { header: 'Role', value: (r) => r.role },
  { header: 'Course', value: (r) => r.course },
  { header: 'Completed', value: (r) => r.completedAt },
  { header: 'Expires', value: (r) => r.expiresAt },
  { header: 'Frequency (months)', value: (r) => r.frequencyMonths },
  { header: 'Mandatory', value: (r) => (r.mandatory ? 'yes' : 'no') },
  { header: 'Result', value: (r) => r.result },
];

export const supplierColumns: CsvColumn<SupplierRecord>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Service', value: (r) => r.serviceType },
  { header: 'Category', value: (r) => r.category },
  { header: 'Environmentally relevant', value: (r) => (r.environmentallyRelevant ? 'yes' : 'no') },
  { header: 'Controls communicated', value: (r) => (r.controlsCommunicated ? 'yes' : 'no') },
  { header: 'Rating', value: (r) => r.rating },
  { header: 'Last evaluated', value: (r) => r.lastEvaluatedAt },
  { header: 'Next evaluation', value: (r) => r.nextEvaluationAt },
  { header: 'Notes', value: (r) => r.notes },
  { header: 'Result', value: (r) => r.result },
];

export const changeColumns: CsvColumn<ManagementOfChangeRecord>[] = [
  { header: 'Change', value: (r) => r.title },
  { header: 'Type', value: (r) => r.changeType },
  { header: 'Status', value: (r) => r.status },
  { header: 'Aspects assessed', value: (r) => (r.aspectsReviewed ? 'yes' : 'no') },
  { header: 'Risk', value: (r) => r.riskLevel },
  { header: 'Owner', value: (r) => r.owner },
  { header: 'Target date', value: (r) => r.targetDate },
  { header: 'Implemented', value: (r) => r.implementedAt },
  { header: 'Controls', value: (r) => r.controls },
  { header: 'Result', value: (r) => r.result },
];

export const carbonColumns: CsvColumn<CarbonEntry>[] = [
  { header: 'Source', value: (r) => r.source },
  { header: 'Scope', value: (r) => r.scope },
  { header: 'Category', value: (r) => r.category },
  { header: 'Period', value: (r) => r.period },
  { header: 'Activity data', value: (r) => r.activityData },
  { header: 'Unit', value: (r) => r.activityUnit },
  { header: 'Emission factor (kgCO2e/unit)', value: (r) => r.emissionFactor },
  { header: 'tCO2e', value: (r) => formatTco2e(emissionTco2e(r)) },
  { header: 'Result', value: (r) => r.result },
];

export const incidentColumns: CsvColumn<EnvironmentalIncident>[] = [
  { header: 'Title', value: (r) => r.title },
  { header: 'Occurred', value: (r) => r.occurredAt },
  { header: 'Location', value: (r) => r.location },
  { header: 'Type', value: (r) => r.incidentType },
  { header: 'Severity', value: (r) => r.severity },
  { header: 'Status', value: (r) => r.status },
  { header: 'Reportable', value: (r) => (r.reportableToRegulator ? 'yes' : 'no') },
  { header: 'Result', value: (r) => r.result },
];

export const permitColumns: CsvColumn<Permit>[] = [
  { header: 'Title', value: (r) => r.title },
  { header: 'Type', value: (r) => r.permitType },
  { header: 'Reference', value: (r) => r.reference },
  { header: 'Authority', value: (r) => r.issuingAuthority },
  { header: 'Issued', value: (r) => r.issuedAt },
  { header: 'Expires', value: (r) => r.expiresAt },
  { header: 'Compliance', value: (r) => r.complianceStatus },
  { header: 'Result', value: (r) => r.result },
];

export const documentColumns: CsvColumn<DocumentedInfoRecord>[] = [
  { header: 'Document', value: (r) => r.document },
  { header: 'Type', value: (r) => r.docType },
  { header: 'Version', value: (r) => r.version },
  { header: 'Owner', value: (r) => r.owner },
  { header: 'Control status', value: (r) => r.controlStatus },
  { header: 'Last reviewed', value: (r) => r.lastReviewedAt },
  { header: 'Next review', value: (r) => r.nextReviewAt },
  { header: 'Attachments', value: (r) => r.attachments?.length ?? 0 },
  { header: 'Result', value: (r) => r.result },
];
