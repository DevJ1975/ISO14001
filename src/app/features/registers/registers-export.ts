import { evaluateRiskRating } from '../../core/domain';
import { CsvColumn } from '../../core/export/csv';
import type {
  CalibrationRecord,
  ContextItem,
  DocumentedInfoRecord,
  EnvironmentalAspect,
  EnvironmentalObjective,
  EnvironmentalObligation,
  Hazard,
  HiraEntry,
  Incident,
  Interview,
  LeadershipItem,
  ManagementOfChangeRecord,
  OperationalControl,
  Permit,
  SupplierRecord,
  TrainingRecord,
  WorkerConsultation,
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
  { header: 'Safety-relevant', value: (r) => (r.environmentallyRelevant ? 'yes' : 'no') },
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
  { header: 'Hazards assessed', value: (r) => (r.aspectsReviewed ? 'yes' : 'no') },
  { header: 'Risk', value: (r) => r.riskLevel },
  { header: 'Owner', value: (r) => r.owner },
  { header: 'Target date', value: (r) => r.targetDate },
  { header: 'Implemented', value: (r) => r.implementedAt },
  { header: 'Controls', value: (r) => r.controls },
  { header: 'Result', value: (r) => r.result },
];

export const operationalControlColumns: CsvColumn<OperationalControl>[] = [
  { header: 'Activity / process', value: (r) => r.activity },
  { header: 'Control', value: (r) => r.controlDescription },
  { header: 'Control type', value: (r) => r.controlType },
  { header: 'Procedure / permit ref', value: (r) => r.procedureRef },
  { header: 'Verified in use', value: (r) => (r.verified ? 'yes' : 'no') },
  { header: 'Effectiveness', value: (r) => r.effectiveness },
  { header: 'Related clause', value: (r) => r.relatedClause },
  { header: 'Result', value: (r) => r.result },
];

const LEADERSHIP_KIND_LABELS: Record<LeadershipItem['kind'], string> = {
  commitment: 'Leadership commitment',
  policyAttribute: 'Policy attribute',
  roleAssignment: 'Role & responsibility',
};

/** Per-group label for the leadership row's yes/no flag (verified / present / communicated). */
const LEADERSHIP_FLAG_LABELS: Record<LeadershipItem['kind'], string> = {
  commitment: 'Verified in interview',
  policyAttribute: 'Present',
  roleAssignment: 'Communicated',
};

export const leadershipColumns: CsvColumn<LeadershipItem>[] = [
  { header: 'Group', value: (r) => LEADERSHIP_KIND_LABELS[r.kind] },
  { header: 'Item', value: (r) => r.label },
  { header: 'Person / owner', value: (r) => r.owner },
  { header: 'Evidence / notes', value: (r) => r.notes },
  { header: 'Flag', value: (r) => `${LEADERSHIP_FLAG_LABELS[r.kind]}: ${r.flag ? 'yes' : 'no'}` },
  { header: 'Related clause', value: (r) => r.relatedClause },
  { header: 'Result', value: (r) => r.result },
];

const CONTEXT_KIND_LABELS: Record<ContextItem['kind'], string> = {
  issue: 'Context issue',
  interestedParty: 'Interested party',
  scope: 'Scope & boundary',
};

export const contextColumns: CsvColumn<ContextItem>[] = [
  { header: 'Group', value: (r) => CONTEXT_KIND_LABELS[r.kind] },
  { header: 'Item', value: (r) => r.label },
  { header: 'Internal/external', value: (r) => r.category },
  { header: 'Evidence / notes', value: (r) => r.notes },
  { header: 'Related clause', value: (r) => r.relatedClause },
  { header: 'Result', value: (r) => r.result },
];

export const hazardColumns: CsvColumn<Hazard>[] = [
  { header: 'Hazard', value: (r) => r.aspect },
  { header: 'Activity', value: (r) => r.activity },
  { header: 'Harm', value: (r) => r.impact },
  { header: 'Risk', value: (r) => r.significance },
  { header: 'Control type', value: (r) => r.controlType },
  { header: 'Controls', value: (r) => r.controls },
  { header: 'Result', value: (r) => r.result },
];

export const hiraColumns: CsvColumn<HiraEntry>[] = [
  { header: 'Activity / task', value: (r) => r.activity },
  { header: 'Routineness', value: (r) => r.routineness },
  { header: 'Hazard', value: (r) => r.hazard },
  { header: 'Who at harm', value: (r) => r.whoAtHarm },
  { header: 'Existing controls', value: (r) => r.existingControls },
  { header: 'Severity', value: (r) => r.severity },
  { header: 'Likelihood', value: (r) => r.likelihood },
  { header: 'Initial band', value: (r) => evaluateRiskRating({ severity: r.severity, likelihood: r.likelihood }).band },
  { header: 'Additional controls', value: (r) => r.additionalControls },
  { header: 'Control type', value: (r) => r.controlType },
  { header: 'Residual severity', value: (r) => r.residualSeverity },
  { header: 'Residual likelihood', value: (r) => r.residualLikelihood },
  { header: 'Residual band', value: (r) => evaluateRiskRating({ severity: r.residualSeverity, likelihood: r.residualLikelihood }).band },
  { header: 'Result', value: (r) => r.result },
];

export const incidentColumns: CsvColumn<Incident>[] = [
  { header: 'Title', value: (r) => r.title },
  { header: 'Occurred', value: (r) => r.occurredAt },
  { header: 'Location', value: (r) => r.location },
  { header: 'Type', value: (r) => r.incidentType },
  { header: 'Severity', value: (r) => r.severity },
  { header: 'Injury class', value: (r) => r.injuryClassification },
  { header: 'Status', value: (r) => r.status },
  { header: 'RIDDOR reportable', value: (r) => (r.reportableToRegulator ? 'yes' : 'no') },
  { header: 'Result', value: (r) => r.result },
];

export const interviewColumns: CsvColumn<Interview>[] = [
  { header: 'Interviewee', value: (r) => r.intervieweeName },
  { header: 'Role', value: (r) => r.role },
  { header: 'Focus area', value: (r) => r.focusArea },
  { header: 'Related clause', value: (r) => r.relatedClause },
  { header: 'Planned', value: (r) => r.plannedAt },
  { header: 'Status', value: (r) => r.status },
  { header: 'Key points', value: (r) => r.keyPoints },
  { header: 'Result', value: (r) => r.result },
];

export const consultationColumns: CsvColumn<WorkerConsultation>[] = [
  { header: 'Topic', value: (r) => r.topic },
  { header: 'Category', value: (r) => r.category },
  { header: 'Mechanism', value: (r) => r.mechanism },
  { header: 'Worker group', value: (r) => r.workerGroup },
  { header: 'Outcome', value: (r) => r.outcome },
  { header: 'Date', value: (r) => r.date },
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

/** ISO 14001 cl. 6.1.2 — environmental aspects & impacts. */
export const envAspectColumns: CsvColumn<EnvironmentalAspect>[] = [
  { header: 'Activity', value: (r) => r.activity },
  { header: 'Aspect', value: (r) => r.aspect },
  { header: 'Impact', value: (r) => r.impact },
  { header: 'Significance', value: (r) => r.significance },
  { header: 'Life-cycle stage', value: (r) => r.lifecycleStage },
  { header: 'Related clause', value: (r) => r.relatedClauseId },
  { header: 'Result', value: (r) => r.result },
];

/** ISO 14001 cl. 6.1.3 — compliance obligations. */
export const envObligationColumns: CsvColumn<EnvironmentalObligation>[] = [
  { header: 'Obligation', value: (r) => r.obligation },
  { header: 'Type', value: (r) => r.obligationType },
  { header: 'Reference', value: (r) => r.reference },
  { header: 'Applicability', value: (r) => r.applicability },
  { header: 'Evaluation status', value: (r) => r.evaluationStatus },
  { header: 'Related clause', value: (r) => r.relatedClauseId },
  { header: 'Result', value: (r) => r.result },
];

/** ISO 14001 cl. 6.2 — environmental objectives & targets. */
export const envObjectiveColumns: CsvColumn<EnvironmentalObjective>[] = [
  { header: 'Objective', value: (r) => r.objective },
  { header: 'Target', value: (r) => r.target },
  { header: 'Metric', value: (r) => r.metric },
  { header: 'Due date', value: (r) => r.dueDate },
  { header: 'Status', value: (r) => r.status },
  { header: 'Related clause', value: (r) => r.relatedClauseId },
  { header: 'Result', value: (r) => r.result },
];
