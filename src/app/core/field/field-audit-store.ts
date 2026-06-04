import { Injectable, computed, inject, signal } from '@angular/core';

import {
  EvidenceRequest,
  EvidenceSubmission,
  PortalMessage,
  PortalMessageAuthor,
  ReportDraft,
  ReportDraftInput,
  ReportSignature,
  SignableReport,
  StandardChecklistRow,
  StandardEdition,
  composeReportDraft,
  editionFromCriteria,
  reportContentHash,
  standardChecklist,
} from '../domain';
import { AuditSelectionService } from './audit-selection.service';
import { FieldApiService } from './field-api.service';
import { idbDelete, idbGet, idbSet } from './idb';

export interface AuditSummary {
  id: string;
  auditee: string;
  scope?: string;
  criteria: string;
  status: string;
  createdByName?: string;
  createdAt?: string;
  startsAt?: string;
  endsAt?: string;
}

export type SyncState = 'synced' | 'queued' | 'syncing' | 'conflict';
export type FieldResult = 'notStarted' | 'conform' | 'minorNc' | 'majorNc' | 'ofi' | 'na';
export type EvidenceKind = 'photo' | 'note';
export type FindingType = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';
/** Nonconformity lifecycle (ISO 45001 cl. 10.2 close-out flow). */
export type NcStatus = 'open' | 'responded' | 'implemented' | 'verified' | 'closed' | 'rejected' | 'reopened';
export type CapaStatus = 'open' | 'inProgress' | 'verificationDue' | 'verified' | 'overdue';
export type DataSource = 'local' | 'live';
export type AuditStatus = 'draft' | 'planned' | 'fieldwork' | 'reporting' | 'followUp' | 'closed' | 'archived';
export type Recommendation = 'recommend' | 'conditional' | 'notRecommended' | 'satisfactory' | 'actionRequired';

export interface AuditMeeting {
  id: string;
  kind: 'opening' | 'closing';
  datetimeAt: string;
  attendees: string[];
  agendaPoints: string[];
  notes?: string;
  acknowledged: boolean;
  sync: SyncState;
}

export interface AuditConclusion {
  overallConformity: string;
  emsEffectivenessOpinion?: string;
  criteriaMetStatement?: string;
  divergingOpinions?: string;
  recommendation: Recommendation;
  updatedAt: string;
  sync: SyncState;
}

export type RegisterResult = 'notStarted' | 'conforming' | 'nonconforming' | 'notApplicable' | 'needsFollowUp';

export type AuditType = 'internal' | 'stage1' | 'stage2' | 'surveillance' | 'recertification';

/** Immutable change-log entry (audit trail) returned by the backend. */
export interface ChangeLogEntry {
  id: string;
  actorUid: string;
  action: string;
  target: string;
  targetId?: string;
  at: string;
}

/**
 * Report front-matter expected on a UKAS-style ISO 45001 report (audit type,
 * dates, scope, criteria, sampling, auditor competence & impartiality,
 * distribution, version). Held as one record so the printed report has a single
 * source of truth rather than being re-derived ad hoc.
 */
export interface ReportMeta {
  auditType: AuditType;
  scope: string;
  objectives: string;
  startsAt?: string;
  endsAt?: string;
  sites: string;
  auditTrail: string;
  leadAuditorName: string;
  auditorCompetence: string;
  impartialityDeclared: boolean;
  distribution: string;
  reportVersion: number;
  sync: SyncState;
}

const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  internal: 'Internal audit (cl. 9.2)',
  stage1: 'Stage 1 — readiness',
  stage2: 'Stage 2 — certification',
  surveillance: 'Surveillance',
  recertification: 'Recertification',
};

export function auditTypeLabel(type: AuditType): string {
  return AUDIT_TYPE_LABELS[type] ?? type;
}

function defaultReportMeta(): ReportMeta {
  return {
    auditType: 'stage2',
    scope: '',
    objectives: '',
    sites: '',
    auditTrail: '',
    leadAuditorName: '',
    auditorCompetence: '',
    impartialityDeclared: false,
    distribution: '',
    reportVersion: 1,
    sync: 'synced',
  };
}

export interface Hazard {
  id: string;
  aspect: string;
  activity: string;
  impact: string;
  significance: 'low' | 'medium' | 'high';
  severityScore?: number;
  likelihoodScore?: number;
  legalConcern?: boolean;
  stakeholderConcern?: boolean;
  significanceRationale?: string;
  controlType?: 'elimination' | 'substitution' | 'engineering' | 'administrative' | 'ppe';
  controls?: string;
  relatedClauseId?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

export interface ComplianceObligation {
  id: string;
  obligation: string;
  source: 'legal' | 'other';
  requirement: string;
  complianceStatus: 'compliant' | 'nonCompliant' | 'toVerify';
  result: RegisterResult;
  lastEvaluatedAt?: string;
  updatedAt: string;
  sync: SyncState;
}

export interface EmergencyRecord {
  id: string;
  scenario: string;
  procedureRef?: string;
  lastDrillAt?: string;
  notes?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

export type ObjectiveProgress = 'notStarted' | 'onTrack' | 'atRisk' | 'achieved';

/** Interested parties & their needs (ISO 45001 cl. 4.2). */
export interface InterestedParty {
  id: string;
  party: string;
  category: 'internal' | 'external';
  needs?: string;
  howAddressed?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** OH&S objectives & targets with progress (ISO 45001 cl. 6.2). */
export interface OhsObjective {
  id: string;
  objective: string;
  target?: string;
  owner?: string;
  dueDate?: string;
  progress: ObjectiveProgress;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Internal & external communication (ISO 45001 cl. 7.4). */
export interface CommunicationRecord {
  id: string;
  topic: string;
  direction: 'internal' | 'external' | 'both';
  audience?: string;
  method?: string;
  frequency?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Worker consultation & participation (ISO 45001 cl. 5.4). */
export interface WorkerConsultation {
  id: string;
  topic: string;
  category:
    | 'policy'
    | 'hazardIdentification'
    | 'riskAssessment'
    | 'controls'
    | 'incidentInvestigation'
    | 'training'
    | 'ppe'
    | 'emergencyArrangements'
    | 'changes'
    | 'other';
  mechanism: 'safetyCommittee' | 'toolboxTalk' | 'survey' | 'rep' | 'directConsultation' | 'other';
  workerGroup?: string;
  participationEvidence?: string;
  outcome?: string;
  date?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Management review inputs, decisions & outputs (ISO 45001 cl. 9.3). */
export interface ManagementReviewRecord {
  id: string;
  reviewDate?: string;
  attendees?: string;
  inputs?: string;
  decisions?: string;
  actions?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Risks & opportunities and their treatment (ISO 45001 cl. 6.1.1). */
export interface RiskOpportunity {
  id: string;
  description: string;
  kind: 'risk' | 'opportunity';
  significance: 'low' | 'medium' | 'high';
  treatment?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Resources provided for the OH&S management system (ISO 45001 cl. 7.1). */
export interface ResourceRecord {
  id: string;
  resource: string;
  category: 'people' | 'infrastructure' | 'financial' | 'technology';
  adequacy: 'adequate' | 'partial' | 'inadequate';
  notes?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Competence & training under the OH&S management system (ISO 45001 cl. 7.2). */
export interface CompetenceRecord {
  id: string;
  role: string;
  requiredCompetence?: string;
  trainingEvidence?: string;
  status: 'competent' | 'inTraining' | 'gap';
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Awareness of policy, hazards and roles (ISO 45001 cl. 7.3). */
export interface AwarenessRecord {
  id: string;
  topic: string;
  audience?: string;
  method?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Metadata for a file attached to a controlled document (blob held locally; mirrors photo evidence). */
export interface DocumentAttachment {
  id: string;
  name: string;
  mime?: string;
  size?: number;
  blobKey?: string;
  uploaded?: boolean;
  addedAt: string;
}

/** Documented information & its control (ISO 45001 cl. 7.5). */
export interface DocumentedInfoRecord {
  id: string;
  document: string;
  docType?: string;
  controlStatus: 'controlled' | 'uncontrolled' | 'draft' | 'obsolete';
  retention?: string;
  /** Document-control extensions: version, owner and periodic-review cycle. */
  version?: string;
  owner?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewFrequencyMonths?: number;
  attachments?: DocumentAttachment[];
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** OH&S permit, licence or consent with renewal/expiry (ISO 45001 cl. 6.1.3 / 9.1.2). */
export interface Permit {
  id: string;
  title: string;
  permitType: 'permit' | 'licence' | 'consent' | 'registration' | 'exemption';
  reference?: string;
  issuingAuthority?: string;
  issuedAt?: string;
  expiresAt?: string;
  renewalReminderDays?: number;
  conditionsSummary?: string;
  monitoringRequirements?: string;
  complianceStatus: 'compliant' | 'nonCompliant' | 'toVerify';
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Training matrix entry — per-person training with renewal/expiry (ISO 45001 cl. 7.2). */
export interface TrainingRecord {
  id: string;
  person: string;
  role?: string;
  course: string;
  completedAt?: string;
  expiresAt?: string;
  frequencyMonths?: number;
  mandatory?: boolean;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Supplier / contractor evaluation (ISO 45001 cl. 8.1 — control of outsourced processes & procurement). */
export interface SupplierRecord {
  id: string;
  name: string;
  serviceType?: string;
  category: 'supplier' | 'contractor' | 'labourProvider' | 'outsourcedProcess' | 'other';
  environmentallyRelevant?: boolean;
  controlsCommunicated?: boolean;
  rating: 'notRated' | 'approved' | 'conditional' | 'rejected';
  lastEvaluatedAt?: string;
  nextEvaluationAt?: string;
  evaluationFrequencyMonths?: number;
  notes?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Management of Change (ISO 45001 cl. 8.1.3 — control of planned changes & their OH&S consequences). */
export interface ManagementOfChangeRecord {
  id: string;
  title: string;
  description?: string;
  changeType: 'process' | 'equipment' | 'material' | 'organisational' | 'regulatory' | 'other';
  status: 'proposed' | 'assessing' | 'approved' | 'implemented' | 'closed' | 'rejected';
  aspectsReviewed?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  owner?: string;
  controls?: string;
  targetDate?: string;
  implementedAt?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Monitoring & measuring equipment calibration (ISO 45001 cl. 9.1.1). */
export interface CalibrationRecord {
  id: string;
  equipment: string;
  identifier?: string;
  parameter?: string;
  method?: string;
  lastCalibratedAt?: string;
  nextDueAt?: string;
  frequencyMonths?: number;
  outOfService?: boolean;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** OH&S incident / near-miss (logged occurrence; ISO 45001 cl. 10.2 / 8.2). */
export interface Incident {
  id: string;
  title: string;
  occurredAt?: string;
  location?: string;
  incidentType: 'injury' | 'illHealth' | 'nearMiss' | 'dangerousOccurrence' | 'propertyDamage' | 'fatality' | 'other';
  severity: 'low' | 'medium' | 'high';
  description?: string;
  immediateAction?: string;
  rootCause?: string;
  correctiveActionRef?: string;
  injuryClassification?: 'none' | 'firstAid' | 'medicalTreatment' | 'lostTime' | 'riddor';
  reportableToRegulator?: boolean;
  status: 'open' | 'investigating' | 'actioned' | 'closed';
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** OH&S performance indicator — monitoring & measurement (ISO 45001 cl. 9.1.1). */
export interface PerformanceMetric {
  id: string;
  indicator: string;
  category:
    | 'lostTimeInjury'
    | 'recordableInjury'
    | 'nearMiss'
    | 'illHealth'
    | 'exposure'
    | 'inspection'
    | 'toolboxTalk'
    | 'trainingCompletion'
    | 'other';
  unit: string;
  period: string;
  baselineValue?: number;
  targetValue?: number;
  actualValue?: number;
  trend: 'improving' | 'stable' | 'worsening' | 'notEvaluated';
  monitoringMethod?: string;
  evaluationNotes?: string;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

export interface FieldChecklistItem {
  id: string;
  clauseId: string;
  clauseTitle: string;
  question: string;
  guidance?: string;
  ownerName: string;
  result: FieldResult;
  note?: string;
  evidenceIds: string[];
  sync: SyncState;
  updatedAt: string;
}

export interface FieldEvidence {
  id: string;
  kind: EvidenceKind;
  itemId?: string;
  clauseId?: string;
  label: string;
  capturedByName: string;
  capturedAt: string;
  geo?: { lat: number; lng: number; accuracyMeters?: number };
  blobKey?: string;
  thumbUrl?: string;
  /** True once the photo blob has been uploaded to Storage (live mode only). */
  uploaded?: boolean;
  sync: SyncState;
}

/** A finding recorded as a nonconformity: graded against a clause with objective evidence. */
export interface FieldFinding {
  id: string;
  clauseId: string;
  clauseTitle: string;
  type: FindingType; // grade
  description: string; // nonconformity statement
  requirementSummary?: string;
  objectiveEvidence?: string;
  gradingRationale?: string;
  systemic?: boolean;
  evidenceIds: string[];
  status: NcStatus;
  createdByName: string;
  createdAt: string;
  /** Auditee acknowledgement + proposed correction, captured via the auditee portal (cl. 10.2). */
  acknowledgedAt?: string;
  responseText?: string;
  sync: SyncState;
}

/**
 * An evidence request shown in the client portal: the auditor asks the auditee
 * to provide a document/record, the auditee uploads it, and both sides discuss
 * it in an attached thread. Wraps the shared domain shape with a sync flag.
 */
export interface FieldEvidenceRequest extends EvidenceRequest {
  sync: SyncState;
}

/** Corrective-action record (ISO 45001 cl. 10.2): correction vs corrective action + effectiveness verification. */
export interface FieldCapa {
  id: string;
  findingId: string;
  correction?: string;
  rootCause?: string;
  action?: string;
  owner?: string;
  dueDate?: string;
  implementationEvidenceIds: string[];
  verification?: string;
  verificationEvidenceIds: string[];
  status: CapaStatus;
  verifiedByName?: string;
  verifiedAt?: string;
  createdAt: string;
  sync: SyncState;
}

interface PersistedState {
  items: FieldChecklistItem[];
  evidence: FieldEvidence[];
  findings: FieldFinding[];
  evidenceRequests: FieldEvidenceRequest[];
  capas: FieldCapa[];
  auditStatus: AuditStatus;
  meetings: AuditMeeting[];
  conclusion: AuditConclusion | null;
  aspects: Hazard[];
  obligations: ComplianceObligation[];
  emergencyRecords: EmergencyRecord[];
  interestedParties: InterestedParty[];
  objectives: OhsObjective[];
  communications: CommunicationRecord[];
  managementReviews: ManagementReviewRecord[];
  workerConsultations: WorkerConsultation[];
  risksOpportunities: RiskOpportunity[];
  resources: ResourceRecord[];
  competence: CompetenceRecord[];
  awareness: AwarenessRecord[];
  documentedInfo: DocumentedInfoRecord[];
  performanceMetrics: PerformanceMetric[];
  permits: Permit[];
  incidents: Incident[];
  calibration: CalibrationRecord[];
  training: TrainingRecord[];
  suppliers: SupplierRecord[];
  changes: ManagementOfChangeRecord[];
  reportMeta: ReportMeta;
  reportSignedAt: string | null;
  reportSignature?: ReportSignature | null;
}

const AUDIT_STATUS_ORDER: AuditStatus[] = ['draft', 'planned', 'fieldwork', 'reporting', 'followUp', 'closed', 'archived'];

const META_KEY = 'state';
const AUDITOR = 'Ava Brooks';

/** Demonstration calibration records — one valid, one due soon, one overdue. */
function seedCalibration(): CalibrationRecord[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<CalibrationRecord>): CalibrationRecord => ({
    id: uid('calib'),
    equipment: '',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ equipment: 'Personal noise dosimeter', identifier: 'ND-204', parameter: 'dB(A) LEP,d', lastCalibratedAt: '2026-01-15', nextDueAt: '2027-01-15', frequencyMonths: 12, result: 'conforming' }),
    base({ equipment: 'LEV face-velocity anemometer', identifier: 'AV-11', parameter: 'Capture velocity (m/s)', lastCalibratedAt: '2025-12-01', nextDueAt: '2026-06-25', frequencyMonths: 6, result: 'needsFollowUp' }),
    base({ equipment: 'Gas detector — confined space', identifier: 'GD-03', parameter: 'O₂ / LEL / H₂S', lastCalibratedAt: '2025-02-01', nextDueAt: '2026-02-01', frequencyMonths: 12, result: 'nonconforming' }),
  ];
}

/** Demonstration controlled documents — current, due-soon and overdue review cycles. */
function seedDocumentedInfo(): DocumentedInfoRecord[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<DocumentedInfoRecord>): DocumentedInfoRecord => ({
    id: uid('doc'),
    document: '',
    controlStatus: 'controlled',
    attachments: [],
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ document: 'OH&S policy', docType: 'Policy', controlStatus: 'controlled', version: 'v3.0', owner: 'H&S Manager', lastReviewedAt: '2025-10-01', nextReviewAt: '2026-10-01', reviewFrequencyMonths: 12, retention: 'Indefinite', result: 'conforming' }),
    base({ document: 'Hazard identification & risk assessment procedure', docType: 'Procedure', controlStatus: 'controlled', version: 'v2.1', owner: 'H&S Lead', lastReviewedAt: '2025-06-20', nextReviewAt: '2026-06-20', reviewFrequencyMonths: 12, result: 'needsFollowUp' }),
    base({ document: 'Asbestos management survey', docType: 'Survey report', controlStatus: 'controlled', version: 'v1.4', owner: 'Site Manager', lastReviewedAt: '2024-12-01', nextReviewAt: '2025-12-01', reviewFrequencyMonths: 12, result: 'nonconforming' }),
  ];
}

/** Demonstration training matrix — current, expiring-soon and lapsed statutory training. */
function seedTraining(): TrainingRecord[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<TrainingRecord>): TrainingRecord => ({
    id: uid('training'),
    person: '',
    course: '',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ person: 'J. Okafor', role: 'H&S lead', course: 'ISO 45001 internal auditor', completedAt: '2025-09-10', expiresAt: '2028-09-10', frequencyMonths: 36, mandatory: true, result: 'conforming' }),
    base({ person: 'M. Silva', role: 'First aider', course: 'First aid at work', completedAt: '2025-07-01', expiresAt: '2026-07-01', frequencyMonths: 12, mandatory: true, result: 'needsFollowUp' }),
    base({ person: 'R. Adeyemi', role: 'MEWP operator', course: 'IPAF MEWP licence', completedAt: '2024-02-20', expiresAt: '2026-02-20', frequencyMonths: 24, mandatory: true, result: 'nonconforming' }),
    base({ person: 'L. Chen', role: 'Maintenance technician', course: 'Working at height / harness', completedAt: '2026-03-15', frequencyMonths: 0, mandatory: false, result: 'conforming' }),
  ];
}

/** Demonstration supplier/contractor evaluations — approved, due-soon, overdue and a not-yet-evaluated party. */
function seedSuppliers(): SupplierRecord[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<SupplierRecord>): SupplierRecord => ({
    id: uid('supplier'),
    name: '',
    category: 'supplier',
    rating: 'notRated',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ name: 'SafeAccess Scaffolding Ltd', serviceType: 'Scaffold erection & inspection', category: 'contractor', environmentallyRelevant: true, controlsCommunicated: true, rating: 'approved', lastEvaluatedAt: '2026-01-10', nextEvaluationAt: '2027-01-10', evaluationFrequencyMonths: 12, result: 'conforming' }),
    base({ name: 'PrimePeople Staffing', serviceType: 'Agency labour supply', category: 'labourProvider', environmentallyRelevant: true, controlsCommunicated: true, rating: 'conditional', lastEvaluatedAt: '2025-07-01', nextEvaluationAt: '2026-07-01', evaluationFrequencyMonths: 12, result: 'needsFollowUp', notes: 'Induction records incomplete; chase competence evidence.' }),
    base({ name: 'ACME Site Maintenance', serviceType: 'On-site maintenance contractor', category: 'contractor', environmentallyRelevant: true, controlsCommunicated: false, rating: 'approved', lastEvaluatedAt: '2025-01-15', nextEvaluationAt: '2026-01-15', evaluationFrequencyMonths: 12, result: 'nonconforming', notes: 'Re-evaluation overdue; safety controls not re-communicated.' }),
    base({ name: 'PrecisionCoat Outsourced Finishing', serviceType: 'Outsourced spray-coating process', category: 'outsourcedProcess', environmentallyRelevant: true, controlsCommunicated: false, rating: 'notRated', result: 'needsFollowUp', notes: 'New provider — initial OH&S evaluation outstanding.' }),
    base({ name: 'Citywide Stationery', serviceType: 'Office supplies', category: 'supplier', environmentallyRelevant: false, rating: 'notRated', result: 'notApplicable' }),
  ];
}

/** Demonstration management-of-change records — on-track, hazards-outstanding and overdue. */
function seedChanges(): ManagementOfChangeRecord[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<ManagementOfChangeRecord>): ManagementOfChangeRecord => ({
    id: uid('moc'),
    title: '',
    changeType: 'process',
    status: 'proposed',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ title: 'New robotic welding cell', description: 'Install robot welding cell with light-guarding on line 2.', changeType: 'equipment', status: 'assessing', aspectsReviewed: true, riskLevel: 'medium', owner: 'Process Eng.', controls: 'New machinery guarding & LOTO; risk assessment in progress.', targetDate: '2026-08-31', result: 'needsFollowUp' }),
    base({ title: 'Switch to water-based degreaser', description: 'Substitute solvent degreaser to reduce inhalation exposure.', changeType: 'material', status: 'implemented', aspectsReviewed: false, riskLevel: 'high', owner: 'H&S Lead', implementedAt: '2026-05-20', result: 'nonconforming', controls: 'Implemented before COSHH/manual-handling reassessment — gap.' }),
    base({ title: 'Reorganise warehouse racking layout', description: 'Relocate racking to widen pedestrian/FLT segregation.', changeType: 'organisational', status: 'approved', aspectsReviewed: true, riskLevel: 'low', owner: 'Site Manager', targetDate: '2026-04-30', result: 'needsFollowUp', controls: 'Barriers and walkway markings specified; target date passed.' }),
    base({ title: 'New PPE at work regulations', description: 'Adapt to updated PPE legal requirements.', changeType: 'regulatory', status: 'closed', aspectsReviewed: true, riskLevel: 'low', owner: 'Compliance', implementedAt: '2026-02-15', result: 'conforming' }),
  ];
}

/** Demonstration worker consultation & participation records (ISO 45001 cl. 5.4). */
function seedConsultations(): WorkerConsultation[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<WorkerConsultation>): WorkerConsultation => ({
    id: uid('consultation'),
    topic: '',
    category: 'other',
    mechanism: 'safetyCommittee',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ topic: 'Review of working-at-height risk assessment', category: 'riskAssessment', mechanism: 'safetyCommittee', workerGroup: 'Maintenance team', participationEvidence: 'Q2 safety committee minutes', outcome: 'Agreed additional edge protection on mezzanine.', date: '2026-05-14', result: 'conforming' }),
    base({ topic: 'New hand-arm vibration controls', category: 'controls', mechanism: 'toolboxTalk', workerGroup: 'Assembly operators', participationEvidence: 'Toolbox-talk sign-in sheet', outcome: 'Operators trialled low-vibration tools; feedback logged.', date: '2026-04-28', result: 'needsFollowUp' }),
    base({ topic: 'PPE selection — cut-resistant gloves', category: 'ppe', mechanism: 'survey', workerGroup: 'Warehouse', participationEvidence: 'PPE preference survey results', outcome: 'Two glove options approved for trial.', date: '2026-03-20', result: 'conforming' }),
  ];
}

/** Demonstration incidents — an open lost-time injury and a closed near-miss. */
function seedIncidents(): Incident[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<Incident>): Incident => ({
    id: uid('incident'),
    title: '',
    incidentType: 'injury',
    severity: 'low',
    status: 'open',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ title: 'Lost-time injury — fall from step ladder', occurredAt: '2026-05-12', location: 'Assembly hall', incidentType: 'injury', severity: 'high', status: 'investigating', result: 'needsFollowUp', immediateAction: 'First aid given; casualty referred to A&E. Ladder quarantined.', injuryClassification: 'lostTime', reportableToRegulator: true }),
    base({ title: 'Near-miss: dropped load from forklift', occurredAt: '2026-04-28', location: 'Warehouse', incidentType: 'nearMiss', severity: 'low', status: 'closed', result: 'conforming', injuryClassification: 'none', rootCause: 'Load not secured per SSOW; refresher training completed.' }),
  ];
}

/** Demonstration permits — one valid, one expiring soon, one expired (relative to the demo audit date). */
function seedPermits(): Permit[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<Permit>): Permit => ({
    id: uid('permit'),
    title: '',
    permitType: 'permit',
    renewalReminderDays: 90,
    complianceStatus: 'toVerify',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ title: 'Asbestos removal licence', permitType: 'licence', reference: 'ARL/AB1234CD', issuingAuthority: 'HSE', issuedAt: '2022-04-01', expiresAt: '2027-09-30', complianceStatus: 'compliant', result: 'conforming', conditionsSummary: 'Licensed work conditions, plans of work and notification.', monitoringRequirements: 'Air monitoring & four-stage clearance per job.' }),
    base({ title: 'Explosives storage licence', permitType: 'licence', reference: 'EX-2024-117', issuingAuthority: 'Local authority', issuedAt: '2024-07-01', expiresAt: '2026-08-15', complianceStatus: 'toVerify', result: 'needsFollowUp', monitoringRequirements: 'Quarterly magazine inspection and stock reconciliation.' }),
    base({ title: 'Pressure systems written scheme of examination', permitType: 'registration', reference: 'PSSR-998877', issuingAuthority: 'Competent person (insurer)', issuedAt: '2023-03-01', expiresAt: '2026-02-28', complianceStatus: 'nonCompliant', result: 'nonconforming', conditionsSummary: 'Thorough examination overdue; arrange before next run.' }),
  ];
}

/** Demonstration 9.1 performance data — OH&S leading/lagging indicators with a target miss and a worsening trend. */
function seedPerformanceMetrics(): PerformanceMetric[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<PerformanceMetric>): PerformanceMetric => ({
    id: uid('metric'),
    indicator: '',
    category: 'lostTimeInjury',
    unit: '',
    period: '2025',
    trend: 'notEvaluated',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ indicator: 'Lost-time injury frequency rate', category: 'lostTimeInjury', unit: 'per 100k hrs', baselineValue: 1.8, targetValue: 1.2, actualValue: 1.1, trend: 'improving', result: 'conforming', monitoringMethod: 'Incident log vs hours worked, monthly reconciliation' }),
    base({ indicator: 'Near-miss reports', category: 'nearMiss', unit: 'count', baselineValue: 40, targetValue: 60, actualValue: 48, trend: 'worsening', result: 'needsFollowUp', evaluationNotes: 'Below reporting target; reinforce reporting culture.' }),
    base({ indicator: 'Safety inspections completed', category: 'inspection', unit: '%', baselineValue: 82, targetValue: 95, actualValue: 97, trend: 'improving', result: 'conforming' }),
    base({ indicator: 'Overdue corrective actions', category: 'other', unit: 'count', baselineValue: 6, targetValue: 0, actualValue: 3, trend: 'stable', result: 'needsFollowUp' }),
  ];
}

const DEMO_SEED_AT = '2026-06-15T15:00:00.000Z';

/**
 * Demo answers layered onto the generated full-standard checklist so the seeded
 * audit still tells a story (clause 4 conform, 6 OFI with a note + evidence, 8
 * not yet started). Keyed by clauseId.
 */
const DEMO_CHECKLIST_ANSWERS: Record<
  string,
  Partial<Pick<FieldChecklistItem, 'ownerName' | 'result' | 'note' | 'evidenceIds'>>
> = {
  '4': { ownerName: 'Maya Chen', result: 'conform' },
  '6': {
    ownerName: 'Omar Patel',
    result: 'ofi',
    note: 'Objective tracking evidence partially available; confirm before signoff.',
    evidenceIds: ['evidence-seed-note'],
  },
  '8': { ownerName: 'Ava Brooks', result: 'notStarted' },
};

function checklistItemId(clauseId: string): string {
  return `item-${clauseId}`;
}

/** Turn a generated clause row into a checklist item, applying any demo answer. */
function rowToItem(row: StandardChecklistRow): FieldChecklistItem {
  const demo = DEMO_CHECKLIST_ANSWERS[row.clauseId];
  return {
    id: checklistItemId(row.clauseId),
    clauseId: row.clauseId,
    clauseTitle: row.clauseTitle,
    question: row.question,
    guidance: row.guidance,
    ownerName: demo?.ownerName ?? '',
    result: demo?.result ?? 'notStarted',
    note: demo?.note,
    evidenceIds: demo?.evidenceIds ?? [],
    sync: 'synced',
    updatedAt: DEMO_SEED_AT,
  };
}

/** Seed the whole ISO 45001 clause set so every clause is answerable from day one. */
function seedItems(edition: StandardEdition['id'] = 'ISO_45001_2018'): FieldChecklistItem[] {
  return standardChecklist(edition).map(rowToItem);
}

function seedEvidence(): FieldEvidence[] {
  return [
    {
      id: 'evidence-seed-note',
      kind: 'note',
      itemId: 'item-6',
      clauseId: '6',
      label: 'Interviewed H&S manager about OH&S planning records; objective tracking needs follow-up.',
      capturedByName: 'Omar Patel',
      capturedAt: '2026-06-15T18:30:00.000Z',
      geo: { lat: 39.7392, lng: -104.9903, accuracyMeters: 12 },
      sync: 'synced',
    },
  ];
}

function seedFindings(): FieldFinding[] {
  return [
    {
      id: 'finding-seed-1',
      clauseId: '6',
      clauseTitle: 'Planning',
      type: 'minorNc',
      description: 'OH&S objective tracking for the current period is not fully evidenced.',
      requirementSummary: 'Cl. 6.2 — establish, monitor and retain documented information on OH&S objectives.',
      objectiveEvidence: 'Objectives register shows 2 of 5 objectives without progress records for the current period.',
      gradingRationale: 'Isolated lapse on a subset of objectives; does not undermine the OH&S management system overall — minor.',
      systemic: false,
      evidenceIds: ['evidence-seed-note'],
      status: 'open',
      createdByName: 'Omar Patel',
      createdAt: '2026-06-15T18:40:00.000Z',
      sync: 'synced',
    },
  ];
}

function seedCapas(): FieldCapa[] {
  return [];
}

/**
 * Demonstration evidence requests spanning the lifecycle: one still outstanding,
 * one the auditee has submitted (awaiting review), one returned for follow-up
 * with an open conversation, and one accepted/closed.
 */
function seedEvidenceRequests(): FieldEvidenceRequest[] {
  return [
    {
      id: 'req-seed-1',
      title: 'Current OH&S objectives register with progress records',
      detail: 'Please upload the objectives register showing measurable targets and the latest progress for each objective this period.',
      clauseId: '6.2',
      clauseTitle: 'OH&S objectives and planning to achieve them',
      status: 'requested',
      dueDate: '2026-06-20',
      createdByName: AUDITOR,
      createdAt: '2026-06-14T09:00:00.000Z',
      submissions: [],
      messages: [],
      sync: 'synced',
    },
    {
      id: 'req-seed-2',
      title: 'Last 3 months of toolbox-talk attendance sheets',
      detail: 'Signed attendance records evidencing worker participation in safety briefings.',
      clauseId: '7.3',
      clauseTitle: 'Awareness',
      status: 'submitted',
      dueDate: '2026-06-16',
      createdByName: AUDITOR,
      createdAt: '2026-06-13T11:30:00.000Z',
      submissions: [
        {
          id: 'sub-seed-1',
          fileName: 'toolbox-talks-Q2.pdf',
          mime: 'application/pdf',
          size: 248_320,
          note: 'April–June signed sheets, all sites.',
          submittedByName: 'Northstar — Dana Okoro',
          submittedAt: '2026-06-15T08:10:00.000Z',
        },
      ],
      messages: [
        {
          id: 'msg-seed-1',
          author: 'auditee',
          authorName: 'Northstar — Dana Okoro',
          body: 'Uploaded the signed sheets. The June session for the night shift is scheduled for the 18th — I can add it once held.',
          at: '2026-06-15T08:11:00.000Z',
        },
      ],
      sync: 'synced',
    },
    {
      id: 'req-seed-3',
      title: 'Calibration certificate — confined-space gas detector (GD-03)',
      detail: 'The current calibration certificate for gas detector GD-03 used for confined-space entry.',
      clauseId: '9.1.1',
      clauseTitle: 'Monitoring, measurement, analysis and evaluation',
      status: 'returned',
      dueDate: '2026-06-17',
      createdByName: AUDITOR,
      createdAt: '2026-06-12T14:00:00.000Z',
      submissions: [
        {
          id: 'sub-seed-2',
          fileName: 'GD-03-cert-2025.pdf',
          mime: 'application/pdf',
          size: 96_140,
          submittedByName: 'Northstar — Dana Okoro',
          submittedAt: '2026-06-14T16:20:00.000Z',
        },
      ],
      messages: [
        {
          id: 'msg-seed-2',
          author: 'auditor',
          authorName: AUDITOR,
          body: 'Thanks — this certificate expired in February 2026. Please provide the current in-date certificate, or confirm the unit is out of service.',
          at: '2026-06-15T10:05:00.000Z',
        },
      ],
      sync: 'synced',
    },
    {
      id: 'req-seed-4',
      title: 'OH&S policy signed by top management',
      detail: 'The current signed and dated OH&S policy.',
      clauseId: '5.2',
      clauseTitle: 'OH&S policy',
      status: 'accepted',
      createdByName: AUDITOR,
      createdAt: '2026-06-11T09:00:00.000Z',
      submissions: [
        {
          id: 'sub-seed-3',
          fileName: 'OHS-policy-signed-2026.pdf',
          mime: 'application/pdf',
          size: 132_900,
          submittedByName: 'Northstar — Dana Okoro',
          submittedAt: '2026-06-12T07:45:00.000Z',
        },
      ],
      messages: [],
      sync: 'synced',
    },
  ];
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function isOverdue(capa: FieldCapa, nowIso: string): boolean {
  return (
    !!capa.dueDate &&
    capa.status !== 'verified' &&
    new Date(capa.dueDate).getTime() < new Date(nowIso).getTime()
  );
}

/**
 * Offline-first source of truth for an in-progress field audit. On startup it
 * tries the live Node/Mongo API; if that is unreachable it falls back to the
 * locally cached/seeded state in IndexedDB. Mutations update local state
 * optimistically, then flush to the API when connected (queued otherwise).
 */
@Injectable({ providedIn: 'root' })
export class FieldAuditStore {
  private readonly api = inject(FieldApiService);
  private readonly selection = inject(AuditSelectionService);

  readonly auditee = signal('Northstar Components — Denver Assembly Plant');
  readonly criteria = signal('ISO 45001:2018');
  readonly audits = signal<AuditSummary[]>([]);
  readonly selectedAuditId = this.selection.selectedAuditId;

  readonly items = signal<FieldChecklistItem[]>(seedItems());
  readonly evidence = signal<FieldEvidence[]>(seedEvidence());
  readonly findings = signal<FieldFinding[]>(seedFindings());
  readonly evidenceRequests = signal<FieldEvidenceRequest[]>(seedEvidenceRequests());
  readonly capas = signal<FieldCapa[]>(seedCapas());
  readonly auditStatus = signal<AuditStatus>('fieldwork');
  readonly meetings = signal<AuditMeeting[]>([]);
  readonly conclusion = signal<AuditConclusion | null>(null);
  readonly aspects = signal<Hazard[]>([]);
  readonly obligations = signal<ComplianceObligation[]>([]);
  readonly emergencyRecords = signal<EmergencyRecord[]>([]);
  readonly interestedParties = signal<InterestedParty[]>([]);
  readonly objectives = signal<OhsObjective[]>([]);
  readonly communications = signal<CommunicationRecord[]>([]);
  readonly managementReviews = signal<ManagementReviewRecord[]>([]);
  readonly workerConsultations = signal<WorkerConsultation[]>(seedConsultations());
  readonly risksOpportunities = signal<RiskOpportunity[]>([]);
  readonly resources = signal<ResourceRecord[]>([]);
  readonly competence = signal<CompetenceRecord[]>([]);
  readonly awareness = signal<AwarenessRecord[]>([]);
  readonly documentedInfo = signal<DocumentedInfoRecord[]>(seedDocumentedInfo());
  readonly performanceMetrics = signal<PerformanceMetric[]>(seedPerformanceMetrics());
  readonly permits = signal<Permit[]>(seedPermits());
  readonly incidents = signal<Incident[]>(seedIncidents());
  readonly calibration = signal<CalibrationRecord[]>(seedCalibration());
  readonly training = signal<TrainingRecord[]>(seedTraining());
  readonly suppliers = signal<SupplierRecord[]>(seedSuppliers());
  readonly changes = signal<ManagementOfChangeRecord[]>(seedChanges());
  readonly reportMeta = signal<ReportMeta>(defaultReportMeta());
  /** Read-only audit trail from the backend (not synced upward). */
  readonly changeLog = signal<ChangeLogEntry[]>([]);
  readonly reportSignedAt = signal<string | null>(null);
  /** Tamper-evident e-signature captured at sign-off (signer, attestation, content hash). */
  readonly reportSignature = signal<ReportSignature | null>(null);
  /** Provenance of the last generated report draft, for the "review before signing" banner. */
  readonly reportDraftInfo = signal<{ source: 'ai' | 'ruleBased'; generatedAt: string } | null>(null);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly source = signal<DataSource>('local');

  private flushing = false;

  readonly progress = computed(() => {
    const items = this.items();
    const done = items.filter((item) => item.result !== 'notStarted').length;
    const total = items.length;
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  });

  readonly outboxCount = computed(
    () =>
      this.items().filter((i) => i.sync !== 'synced').length +
      this.evidence().filter((e) => e.sync !== 'synced').length +
      this.findings().filter((f) => f.sync !== 'synced').length +
      this.evidenceRequests().filter((r) => r.sync !== 'synced').length +
      this.capas().filter((c) => c.sync !== 'synced').length +
      this.meetings().filter((m) => m.sync !== 'synced').length +
      this.aspects().filter((a) => a.sync !== 'synced').length +
      this.obligations().filter((o) => o.sync !== 'synced').length +
      this.emergencyRecords().filter((e) => e.sync !== 'synced').length +
      this.interestedParties().filter((p) => p.sync !== 'synced').length +
      this.objectives().filter((o) => o.sync !== 'synced').length +
      this.communications().filter((c) => c.sync !== 'synced').length +
      this.managementReviews().filter((m) => m.sync !== 'synced').length +
      this.workerConsultations().filter((c) => c.sync !== 'synced').length +
      this.risksOpportunities().filter((r) => r.sync !== 'synced').length +
      this.resources().filter((r) => r.sync !== 'synced').length +
      this.competence().filter((c) => c.sync !== 'synced').length +
      this.awareness().filter((a) => a.sync !== 'synced').length +
      this.documentedInfo().filter((d) => d.sync !== 'synced').length +
      this.performanceMetrics().filter((m) => m.sync !== 'synced').length +
      this.permits().filter((p) => p.sync !== 'synced').length +
      this.incidents().filter((i) => i.sync !== 'synced').length +
      this.calibration().filter((c) => c.sync !== 'synced').length +
      this.training().filter((t) => t.sync !== 'synced').length +
      this.suppliers().filter((s) => s.sync !== 'synced').length +
      this.changes().filter((c) => c.sync !== 'synced').length +
      (this.conclusion() && this.conclusion()!.sync !== 'synced' ? 1 : 0) +
      (this.reportMeta().sync !== 'synced' ? 1 : 0),
  );

  readonly nextAuditStatuses = computed(() => {
    const index = AUDIT_STATUS_ORDER.indexOf(this.auditStatus());
    return AUDIT_STATUS_ORDER.slice(index + 1);
  });

  readonly resultTotals = computed(() => {
    const totals: Record<FieldResult, number> = { notStarted: 0, conform: 0, minorNc: 0, majorNc: 0, ofi: 0, na: 0 };
    for (const item of this.items()) totals[item.result] += 1;
    return totals;
  });

  readonly ncCountsByGrade = computed(() => {
    const totals: Record<FindingType, number> = { conformity: 0, minorNc: 0, majorNc: 0, ofi: 0 };
    for (const finding of this.findings()) totals[finding.type] += 1;
    return totals;
  });

  readonly overdueCapas = computed(() => {
    const now = new Date().toISOString();
    return this.capas().filter((capa) => isOverdue(capa, now));
  });

  readonly openNcCount = computed(
    () => this.findings().filter((f) => f.type !== 'ofi' && f.type !== 'conformity' && f.status !== 'closed').length,
  );

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online.set(true);
        this.autoFlush();
      });
      window.addEventListener('offline', () => this.online.set(false));
      void this.bootstrap();
    }
  }

  setResult(itemId: string, result: FieldResult): void {
    this.items.update((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, result, sync: 'queued', updatedAt: new Date().toISOString() } : item,
      ),
    );
    this.persist();
    this.autoFlush();
  }

  setNote(itemId: string, note: string): void {
    this.items.update((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, note, sync: 'queued', updatedAt: new Date().toISOString() } : item,
      ),
    );
    this.persist();
    this.autoFlush();
  }

  /**
   * Append any standard clauses not yet present as checklist items so the auditor
   * can record conformity for the whole standard (idempotent). Returns the number
   * of clauses added; items are kept in standard clause order.
   */
  addMissingClauseItems(edition?: StandardEdition['id']): number {
    const ed = edition ?? editionFromCriteria(this.criteria());
    const rows = standardChecklist(ed);
    const existing = new Set(this.items().map((item) => item.clauseId));
    const additions = rows
      .filter((row) => !existing.has(row.clauseId))
      .map((row) => ({ ...rowToItem(row), sync: 'queued' as const, updatedAt: new Date().toISOString() }));
    if (!additions.length) return 0;
    const order = new Map(rows.map((row, index) => [row.clauseId, index]));
    this.items.update((items) =>
      [...items, ...additions].sort(
        (a, b) =>
          (order.get(a.clauseId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.clauseId) ?? Number.MAX_SAFE_INTEGER),
      ),
    );
    this.persist();
    this.autoFlush();
    return additions.length;
  }

  /** Add a single clause row on demand (no-op if it is already present). */
  addChecklistItem(clauseId: string, edition?: StandardEdition['id']): void {
    if (this.items().some((item) => item.clauseId === clauseId)) return;
    const ed = edition ?? editionFromCriteria(this.criteria());
    const row = standardChecklist(ed).find((candidate) => candidate.clauseId === clauseId);
    if (!row) return;
    const item: FieldChecklistItem = { ...rowToItem(row), sync: 'queued', updatedAt: new Date().toISOString() };
    this.items.update((items) => [...items, item]);
    this.persist();
    this.autoFlush();
  }

  /** Add a custom/tailored check (e.g. an industry- or client-specific question) against any clause. */
  addCustomChecklistItem(input: { clauseId: string; clauseTitle?: string; question: string; guidance?: string }): void {
    const clauseId = input.clauseId.trim() || 'custom';
    const question = input.question.trim();
    if (!question) return;
    const item: FieldChecklistItem = {
      id: uid('item'),
      clauseId,
      clauseTitle: input.clauseTitle?.trim() || clauseId,
      question,
      guidance: input.guidance?.trim() || undefined,
      ownerName: '',
      result: 'notStarted',
      evidenceIds: [],
      sync: 'queued',
      updatedAt: new Date().toISOString(),
    };
    this.items.update((items) => [...items, item]);
    this.persist();
    this.autoFlush();
  }

  /** Edit a check's wording (question/guidance/title) to tailor it to the auditee. */
  updateChecklistItem(itemId: string, patch: { question?: string; guidance?: string; clauseTitle?: string }): void {
    this.items.update((items) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...(patch.question !== undefined ? { question: patch.question.trim() } : {}),
              ...(patch.guidance !== undefined ? { guidance: patch.guidance.trim() || undefined } : {}),
              ...(patch.clauseTitle !== undefined ? { clauseTitle: patch.clauseTitle.trim() } : {}),
              sync: 'queued',
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    this.persist();
    this.autoFlush();
  }

  /** Remove a check from this audit's checklist. */
  removeChecklistItem(itemId: string): void {
    this.items.update((items) => items.filter((item) => item.id !== itemId));
    this.persist();
    this.autoFlush();
  }

  addNoteEvidence(input: { itemId?: string; clauseId?: string; text: string }): void {
    const id = uid('evidence-note');
    const record: FieldEvidence = {
      id,
      kind: 'note',
      itemId: input.itemId,
      clauseId: input.clauseId,
      label: input.text,
      capturedByName: AUDITOR,
      capturedAt: new Date().toISOString(),
      sync: 'queued',
    };
    this.evidence.update((list) => [record, ...list]);
    this.linkEvidence(input.itemId, id);
    this.persist();
    this.autoFlush();
  }

  async addPhotoEvidence(file: File, input: { itemId?: string; clauseId?: string }): Promise<void> {
    const id = uid('evidence-photo');
    const blobKey = id;
    await idbSet('blobs', blobKey, file);
    const thumbUrl = typeof URL !== 'undefined' ? URL.createObjectURL(file) : undefined;
    const record: FieldEvidence = {
      id,
      kind: 'photo',
      itemId: input.itemId,
      clauseId: input.clauseId,
      label: file.name || 'Site photo',
      capturedByName: AUDITOR,
      capturedAt: new Date().toISOString(),
      geo: await this.tryGeolocate(),
      blobKey,
      thumbUrl,
      sync: 'queued',
    };
    this.evidence.update((list) => [record, ...list]);
    this.linkEvidence(input.itemId, id);
    this.persist();
    this.autoFlush();
  }

  /**
   * Resolve a displayable URL for a photo: the local object URL if we captured
   * it on this device, otherwise a short-lived signed URL from Storage (live).
   */
  async resolvePhotoUrl(evidenceId: string): Promise<string | null> {
    const record = this.evidence().find((entry) => entry.id === evidenceId);
    if (!record) return null;
    if (record.thumbUrl) return record.thumbUrl;
    if (this.source() !== 'live' || !record.uploaded) return null;
    const url = await this.api.evidenceViewUrl(evidenceId);
    if (url) {
      this.evidence.update((list) => list.map((entry) => (entry.id === evidenceId ? { ...entry, thumbUrl: url } : entry)));
    }
    return url;
  }

  /** Resolve a downloadable object URL for a document attachment held locally. */
  async resolveAttachmentUrl(blobKey: string | undefined): Promise<string | null> {
    if (!blobKey || typeof URL === 'undefined') return null;
    const blob = await idbGet<Blob>('blobs', blobKey);
    return blob ? URL.createObjectURL(blob) : null;
  }

  /** Raise a nonconformity / OFI from a checklist item. */
  promoteToFinding(itemId: string, type: FindingType, description: string): void {
    const item = this.items().find((entry) => entry.id === itemId);
    if (!item) return;
    const finding: FieldFinding = {
      id: uid('finding'),
      clauseId: item.clauseId,
      clauseTitle: item.clauseTitle,
      type,
      description,
      requirementSummary: `Clause ${item.clauseId} — ${item.clauseTitle}`,
      objectiveEvidence: item.note ?? '',
      evidenceIds: [...item.evidenceIds],
      status: 'open',
      createdByName: AUDITOR,
      createdAt: new Date().toISOString(),
      sync: 'queued',
    };
    this.findings.update((list) => [finding, ...list]);
    this.persist();
    this.autoFlush();
  }

  /** Lead-auditor grades the nonconformity and records the rationale. */
  gradeFinding(id: string, grade: FindingType, rationale: string, systemic: boolean): void {
    this.updateFinding(id, { type: grade, gradingRationale: rationale, systemic });
  }

  editFinding(id: string, patch: Partial<Pick<FieldFinding, 'description' | 'requirementSummary' | 'objectiveEvidence'>>): void {
    this.updateFinding(id, patch);
  }

  advanceNcStatus(id: string, status: NcStatus): void {
    this.updateFinding(id, { status });
  }

  /**
   * Auditee acknowledgement of a finding with a proposed correction (auditee
   * portal). Records the response and advances an open NC to "responded".
   */
  acknowledgeFinding(id: string, responseText: string): void {
    const finding = this.findings().find((f) => f.id === id);
    if (!finding) return;
    const acknowledgedAt = new Date().toISOString();
    const status: NcStatus = finding.status === 'open' || finding.status === 'reopened' ? 'responded' : finding.status;
    this.updateFinding(id, { acknowledgedAt, responseText: responseText.trim(), status });
  }

  // --- Evidence requests / client portal -----------------------------------

  /** Auditor raises a new evidence request for the auditee to fulfil. */
  createEvidenceRequest(input: {
    title: string;
    detail?: string;
    clauseId?: string;
    clauseTitle?: string;
    dueDate?: string;
    createdByName?: string;
  }): FieldEvidenceRequest {
    const request: FieldEvidenceRequest = {
      id: uid('req'),
      title: input.title.trim(),
      detail: input.detail?.trim() ?? '',
      clauseId: input.clauseId?.trim() || undefined,
      clauseTitle: input.clauseTitle?.trim() || undefined,
      status: 'requested',
      dueDate: input.dueDate || undefined,
      createdByName: input.createdByName?.trim() || AUDITOR,
      createdAt: new Date().toISOString(),
      submissions: [],
      messages: [],
      sync: 'queued',
    };
    this.evidenceRequests.update((list) => [request, ...list]);
    this.persist();
    this.autoFlush();
    return request;
  }

  /** Auditee attaches a submission (file metadata and/or a note); advances to "submitted". */
  submitEvidence(
    requestId: string,
    submission: { fileName?: string; mime?: string; size?: number; note?: string },
    submittedByName: string,
  ): void {
    const entry: EvidenceSubmission = {
      id: uid('sub'),
      fileName: submission.fileName,
      mime: submission.mime,
      size: submission.size,
      note: submission.note?.trim() || undefined,
      submittedByName: submittedByName.trim() || 'Auditee',
      submittedAt: new Date().toISOString(),
    };
    this.updateEvidenceRequest(requestId, (req) => ({
      submissions: [...req.submissions, entry],
      status: 'submitted',
    }));
  }

  /** Auditor accepts the provided evidence — the request is closed. */
  acceptEvidenceRequest(requestId: string): void {
    this.updateEvidenceRequest(requestId, () => ({ status: 'accepted' }));
  }

  /** Auditor returns the request for follow-up, recording the reason as a thread message. */
  returnEvidenceRequest(requestId: string, reason: string, authorName?: string): void {
    const note = reason.trim();
    this.updateEvidenceRequest(requestId, (req) => ({
      status: 'returned',
      messages: note ? [...req.messages, this.buildMessage('auditor', authorName ?? AUDITOR, note)] : req.messages,
    }));
  }

  /** Post a message to the request thread (either side). Does not change status. */
  postRequestMessage(requestId: string, author: PortalMessageAuthor, authorName: string, body: string): void {
    const text = body.trim();
    if (!text) return;
    this.updateEvidenceRequest(requestId, (req) => ({
      messages: [...req.messages, this.buildMessage(author, authorName, text)],
    }));
  }

  private buildMessage(author: PortalMessageAuthor, authorName: string, body: string): PortalMessage {
    return { id: uid('msg'), author, authorName: authorName.trim() || (author === 'auditor' ? AUDITOR : 'Auditee'), body, at: new Date().toISOString() };
  }

  private updateEvidenceRequest(
    requestId: string,
    patch: (req: FieldEvidenceRequest) => Partial<Omit<FieldEvidenceRequest, 'id' | 'sync'>>,
  ): void {
    this.evidenceRequests.update((list) =>
      list.map((req) =>
        req.id === requestId
          ? { ...req, ...patch(req), updatedAt: new Date().toISOString(), sync: 'queued' as SyncState }
          : req,
      ),
    );
    this.persist();
    this.autoFlush();
  }

  /** Start (or return) the CAPA record for a nonconformity. */
  startCapa(findingId: string): FieldCapa {
    const existing = this.capas().find((capa) => capa.findingId === findingId);
    if (existing) return existing;
    const capa: FieldCapa = {
      id: uid('capa'),
      findingId,
      implementationEvidenceIds: [],
      verificationEvidenceIds: [],
      status: 'open',
      createdAt: new Date().toISOString(),
      sync: 'queued',
    };
    this.capas.update((list) => [capa, ...list]);
    this.advanceNcStatus(findingId, 'responded');
    this.persist();
    this.autoFlush();
    return capa;
  }

  updateCapa(
    capaId: string,
    patch: Partial<Pick<FieldCapa, 'correction' | 'rootCause' | 'action' | 'owner' | 'dueDate' | 'implementationEvidenceIds'>>,
  ): void {
    this.capas.update((list) =>
      list.map((capa) => {
        if (capa.id !== capaId) return capa;
        const next = { ...capa, ...patch, sync: 'queued' as SyncState };
        next.status = deriveCapaStatus(next);
        return next;
      }),
    );
    const capa = this.capas().find((entry) => entry.id === capaId);
    if (capa && (capa.implementationEvidenceIds.length > 0 || capa.status === 'verificationDue')) {
      this.advanceNcStatus(capa.findingId, 'implemented');
    }
    this.persist();
    this.autoFlush();
  }

  /** Lead-auditor verification of effectiveness — requires connectivity (server enforces leadAuditor). */
  async verifyCapa(capaId: string, input: { verification: string; effective: boolean; evidenceIds?: string[] }): Promise<boolean> {
    const capa = this.capas().find((entry) => entry.id === capaId);
    if (!capa || !this.online() || this.source() !== 'live') return false;
    try {
      await this.api.verifyCapa(capaId, {
        findingId: capa.findingId,
        verification: input.verification,
        effective: input.effective,
        verificationEvidenceIds: input.evidenceIds ?? [],
      });
    } catch {
      return false;
    }
    const now = new Date().toISOString();
    this.capas.update((list) =>
      list.map((entry) =>
        entry.id === capaId
          ? {
              ...entry,
              verification: input.verification,
              verificationEvidenceIds: input.evidenceIds ?? entry.verificationEvidenceIds,
              status: input.effective ? 'verified' : 'inProgress',
              verifiedByName: AUDITOR,
              verifiedAt: now,
              sync: 'synced',
            }
          : entry,
      ),
    );
    this.advanceNcStatus(capa.findingId, input.effective ? 'closed' : 'reopened');
    this.persist();
    return true;
  }

  setAuditStatus(status: AuditStatus): void {
    this.auditStatus.set(status);
    this.persist();
    if (this.source() === 'live' && this.online()) {
      void this.api.setAuditStatus(status).catch(() => undefined);
    }
  }

  recordMeeting(
    kind: 'opening' | 'closing',
    input: { datetimeAt: string; attendees: string[]; agendaPoints: string[]; notes?: string; acknowledged: boolean },
  ): void {
    const existing = this.meetings().find((meeting) => meeting.kind === kind);
    const meeting: AuditMeeting = { id: existing?.id ?? uid(`meeting-${kind}`), kind, ...input, sync: 'queued' };
    this.meetings.update((list) => [meeting, ...list.filter((entry) => entry.kind !== kind)]);
    this.persist();
    this.autoFlush();
  }

  saveConclusion(patch: Partial<Omit<AuditConclusion, 'sync' | 'updatedAt'>>): void {
    const current: AuditConclusion =
      this.conclusion() ?? { overallConformity: '', recommendation: 'satisfactory', updatedAt: '', sync: 'queued' };
    this.conclusion.set({ ...current, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' });
    this.persist();
    this.autoFlush();
  }

  /**
   * Auto-draft the audit conclusions from this audit's own data. Uses the
   * server-side AI provider when live & online; otherwise the offline rule-based
   * composer. The lead auditor reviews and edits every field before signing.
   */
  async generateReportDraft(): Promise<'ai' | 'ruleBased'> {
    const input = this.buildReportDraftInput();
    let draft: ReportDraft;
    if (this.source() === 'live' && this.online()) {
      try {
        draft = await this.api.draftReport(input);
      } catch {
        draft = composeReportDraft(input);
      }
    } else {
      draft = composeReportDraft(input);
    }
    this.saveConclusion({
      overallConformity: draft.overallConformity,
      emsEffectivenessOpinion: draft.emsEffectivenessOpinion,
      criteriaMetStatement: draft.criteriaMetStatement,
      recommendation: draft.recommendation,
    });
    this.reportDraftInfo.set({ source: draft.source, generatedAt: draft.generatedAt });
    return draft.source;
  }

  private buildReportDraftInput(): ReportDraftInput {
    const labels: Record<AuditType, string> = {
      internal: 'Internal',
      stage1: 'Stage 1 certification',
      stage2: 'Stage 2 certification',
      surveillance: 'Surveillance',
      recertification: 'Recertification',
    };
    return {
      auditee: this.auditee(),
      criteria: this.criteria(),
      auditTypeLabel: labels[this.reportMeta().auditType] ?? 'Audit',
      checklist: this.items().map((item) => ({
        clauseId: item.clauseId,
        clauseTitle: item.clauseTitle,
        result: item.result,
      })),
      findings: this.findings().map((finding) => ({
        type: finding.type,
        clauseId: finding.clauseId,
        clauseTitle: finding.clauseTitle,
        status: finding.status,
      })),
      evidenceCount: this.evidence().length,
      overdueCapaCount: this.overdueCapas().length,
    };
  }

  /** Update the report front-matter (UK-style report metadata). Synced to the
   *  backend so it travels across devices/team members, like the conclusion. */
  updateReportMeta(patch: Partial<Omit<ReportMeta, 'sync'>>): void {
    this.reportMeta.update((meta) => ({ ...meta, ...patch, sync: 'queued' }));
    this.persist();
    this.autoFlush();
  }

  addAspect(): void {
    this.aspects.update((list) => [
      { id: uid('aspect'), aspect: '', activity: '', impact: '', significance: 'medium', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateAspect(id: string, patch: Partial<Hazard>): void {
    this.aspects.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addObligation(): void {
    this.obligations.update((list) => [
      { id: uid('obligation'), obligation: '', source: 'legal', requirement: '', complianceStatus: 'toVerify', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateObligation(id: string, patch: Partial<ComplianceObligation>): void {
    this.obligations.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addEmergencyRecord(): void {
    this.emergencyRecords.update((list) => [
      { id: uid('emergency'), scenario: '', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateEmergencyRecord(id: string, patch: Partial<EmergencyRecord>): void {
    this.emergencyRecords.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addInterestedParty(): void {
    this.interestedParties.update((list) => [
      { id: uid('party'), party: '', category: 'external', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateInterestedParty(id: string, patch: Partial<InterestedParty>): void {
    this.interestedParties.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addObjective(): void {
    this.objectives.update((list) => [
      { id: uid('objective'), objective: '', progress: 'notStarted', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateObjective(id: string, patch: Partial<OhsObjective>): void {
    this.objectives.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addCommunication(): void {
    this.communications.update((list) => [
      { id: uid('comm'), topic: '', direction: 'internal', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateCommunication(id: string, patch: Partial<CommunicationRecord>): void {
    this.communications.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addManagementReview(): void {
    this.managementReviews.update((list) => [
      { id: uid('review'), result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateManagementReview(id: string, patch: Partial<ManagementReviewRecord>): void {
    this.managementReviews.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addWorkerConsultation(): void {
    this.workerConsultations.update((list) => [
      { id: uid('consultation'), topic: '', category: 'other', mechanism: 'safetyCommittee', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateWorkerConsultation(id: string, patch: Partial<WorkerConsultation>): void {
    this.workerConsultations.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addRiskOpportunity(): void {
    this.risksOpportunities.update((list) => [
      { id: uid('risk'), description: '', kind: 'risk', significance: 'medium', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateRiskOpportunity(id: string, patch: Partial<RiskOpportunity>): void {
    this.risksOpportunities.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addResource(): void {
    this.resources.update((list) => [
      { id: uid('resource'), resource: '', category: 'people', adequacy: 'adequate', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateResource(id: string, patch: Partial<ResourceRecord>): void {
    this.resources.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addCompetence(): void {
    this.competence.update((list) => [
      { id: uid('competence'), role: '', status: 'competent', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateCompetence(id: string, patch: Partial<CompetenceRecord>): void {
    this.competence.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addAwareness(): void {
    this.awareness.update((list) => [
      { id: uid('awareness'), topic: '', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateAwareness(id: string, patch: Partial<AwarenessRecord>): void {
    this.awareness.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addDocumentedInfo(): void {
    this.documentedInfo.update((list) => [
      { id: uid('doc'), document: '', controlStatus: 'controlled', attachments: [], result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  /** Attach a file to a controlled document; the blob is stored locally (mirrors photo evidence). */
  async addDocumentAttachment(docId: string, file: File): Promise<void> {
    const attachmentId = uid('docfile');
    const blobKey = attachmentId;
    await idbSet('blobs', blobKey, file);
    const attachment: DocumentAttachment = {
      id: attachmentId,
      name: file.name || 'Attachment',
      mime: file.type || undefined,
      size: file.size || undefined,
      blobKey,
      addedAt: new Date().toISOString(),
    };
    this.documentedInfo.update((list) =>
      list.map((entry) =>
        entry.id === docId
          ? { ...entry, attachments: [...(entry.attachments ?? []), attachment], updatedAt: new Date().toISOString(), sync: 'queued' }
          : entry,
      ),
    );
    this.persist();
    this.autoFlush();
  }

  /** Remove an attachment from a controlled document and delete its local blob. */
  async removeDocumentAttachment(docId: string, attachmentId: string): Promise<void> {
    const doc = this.documentedInfo().find((entry) => entry.id === docId);
    const attachment = doc?.attachments?.find((a) => a.id === attachmentId);
    if (attachment?.blobKey) await idbDelete('blobs', attachment.blobKey);
    this.documentedInfo.update((list) =>
      list.map((entry) =>
        entry.id === docId
          ? { ...entry, attachments: (entry.attachments ?? []).filter((a) => a.id !== attachmentId), updatedAt: new Date().toISOString(), sync: 'queued' }
          : entry,
      ),
    );
    this.persist();
    this.autoFlush();
  }

  updateDocumentedInfo(id: string, patch: Partial<DocumentedInfoRecord>): void {
    this.documentedInfo.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addPerformanceMetric(): void {
    this.performanceMetrics.update((list) => [
      { id: uid('metric'), indicator: '', category: 'nearMiss', unit: '', period: '', trend: 'notEvaluated', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updatePerformanceMetric(id: string, patch: Partial<PerformanceMetric>): void {
    this.performanceMetrics.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addPermit(): void {
    this.permits.update((list) => [
      { id: uid('permit'), title: '', permitType: 'permit', renewalReminderDays: 90, complianceStatus: 'toVerify', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updatePermit(id: string, patch: Partial<Permit>): void {
    this.permits.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addIncident(): void {
    this.incidents.update((list) => [
      { id: uid('incident'), title: '', incidentType: 'injury', severity: 'low', status: 'open', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateIncident(id: string, patch: Partial<Incident>): void {
    this.incidents.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addCalibration(): void {
    this.calibration.update((list) => [
      { id: uid('calib'), equipment: '', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateCalibration(id: string, patch: Partial<CalibrationRecord>): void {
    this.calibration.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addTraining(): void {
    this.training.update((list) => [
      { id: uid('training'), person: '', course: '', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateTraining(id: string, patch: Partial<TrainingRecord>): void {
    this.training.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addSupplier(): void {
    this.suppliers.update((list) => [
      { id: uid('supplier'), name: '', category: 'supplier', rating: 'notRated', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateSupplier(id: string, patch: Partial<SupplierRecord>): void {
    this.suppliers.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  addChange(): void {
    this.changes.update((list) => [
      { id: uid('moc'), title: '', changeType: 'process', status: 'proposed', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateChange(id: string, patch: Partial<ManagementOfChangeRecord>): void {
    this.changes.update((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString(), sync: 'queued' } : entry)),
    );
    this.persist();
    this.autoFlush();
  }

  /** The order-stable view of the report that an e-signature attests to. */
  signableReport(): SignableReport {
    const conclusion = this.conclusion();
    const meta = this.reportMeta();
    return {
      auditee: this.auditee(),
      criteria: this.criteria(),
      scope: meta.scope,
      auditType: meta.auditType,
      overallConformity: conclusion?.overallConformity,
      recommendation: conclusion?.recommendation,
      findings: this.findings().map((f) => ({
        id: f.id,
        type: f.type,
        clauseId: f.clauseId,
        status: f.status,
        description: f.description,
      })),
    };
  }

  /**
   * Lead-auditor sign-off. Captures a tamper-evident e-signature (signer +
   * attestation + SHA-256 of the report content). Persisted to the server when
   * live; recorded locally otherwise.
   */
  async signOff(
    attestation: string,
    signer: { uid: string; name: string; role: string } = { uid: 'guest', name: 'Lead auditor', role: 'leadAuditor' },
  ): Promise<boolean> {
    const contentHash = await reportContentHash(this.signableReport());
    const signedAt = new Date().toISOString();
    const buildSignature = (at: string): ReportSignature => ({
      signerName: signer.name,
      signerUid: signer.uid,
      signerRole: signer.role,
      signedAt: at,
      attestation,
      contentHash,
      algorithm: 'SHA-256',
      hashVersion: 1,
    });
    if (this.source() === 'live' && this.online()) {
      try {
        const result = (await this.api.signReport({ attestation, contentHash })) as { signedAt?: string };
        const at = result?.signedAt ?? signedAt;
        this.reportSignedAt.set(at);
        this.reportSignature.set(buildSignature(at));
        this.persist();
        return true;
      } catch {
        return false;
      }
    }
    this.reportSignedAt.set(signedAt);
    this.reportSignature.set(buildSignature(signedAt));
    this.persist();
    return true;
  }

  /** Flush the outbox: replays queued records to the API when live, else simulates. */
  syncNow(): void {
    if (!this.online()) return;
    if (this.source() === 'live') {
      void this.flushLive();
      return;
    }
    const toSyncing = <T extends { sync: SyncState }>(record: T): T =>
      record.sync === 'queued' || record.sync === 'conflict' ? { ...record, sync: 'syncing' } : record;
    this.items.update((list) => list.map(toSyncing));
    this.evidence.update((list) => list.map(toSyncing));
    this.findings.update((list) => list.map(toSyncing));
    this.evidenceRequests.update((list) => list.map(toSyncing));
    this.capas.update((list) => list.map(toSyncing));
    this.meetings.update((list) => list.map(toSyncing));

    setTimeout(() => {
      const toSynced = <T extends { sync: SyncState }>(record: T): T =>
        record.sync === 'syncing' ? { ...record, sync: 'synced' } : record;
      this.items.update((list) => list.map(toSynced));
      this.evidence.update((list) => list.map(toSynced));
      this.findings.update((list) => list.map(toSynced));
      this.evidenceRequests.update((list) => list.map(toSynced));
      this.capas.update((list) => list.map(toSynced));
      this.meetings.update((list) => list.map(toSynced));
      const concl = this.conclusion();
      if (concl) this.conclusion.set({ ...concl, sync: 'synced' });
      this.persist();
    }, 900);
  }

  async resetDemo(): Promise<void> {
    this.items.set(seedItems());
    this.evidence.set(seedEvidence());
    this.findings.set(seedFindings());
    this.evidenceRequests.set(seedEvidenceRequests());
    this.capas.set(seedCapas());
    this.auditStatus.set('fieldwork');
    this.meetings.set([]);
    this.conclusion.set(null);
    this.aspects.set([]);
    this.obligations.set([]);
    this.emergencyRecords.set([]);
    this.interestedParties.set([]);
    this.objectives.set([]);
    this.communications.set([]);
    this.managementReviews.set([]);
    this.workerConsultations.set(seedConsultations());
    this.risksOpportunities.set([]);
    this.resources.set([]);
    this.competence.set([]);
    this.awareness.set([]);
    this.documentedInfo.set(seedDocumentedInfo());
    this.performanceMetrics.set(seedPerformanceMetrics());
    this.permits.set(seedPermits());
    this.incidents.set(seedIncidents());
    this.calibration.set(seedCalibration());
    this.training.set(seedTraining());
    this.suppliers.set(seedSuppliers());
    this.changes.set(seedChanges());
    this.reportMeta.set(defaultReportMeta());
    this.reportSignedAt.set(null);
    this.reportSignature.set(null);
    await idbDelete('meta', META_KEY);
  }

  /** Re-fetch from the live API (e.g. after sign-in), falling back to local state. */
  async reload(): Promise<void> {
    await this.bootstrap();
  }

  /** Load the tenant's audit list (live only; no-op offline). */
  async loadAudits(): Promise<void> {
    try {
      const audits = await this.api.listAudits();
      this.audits.set(audits);
    } catch {
      /* offline / local mode: leave the list as-is */
    }
  }

  /** Create a new audit, switch to it, and load its (empty) state. */
  async createAudit(input: { auditee: string; scope: string; criteria: string }): Promise<AuditSummary | null> {
    try {
      const audit = await this.api.createAudit(input);
      this.selection.select(audit.id);
      await this.bootstrap();
      return audit;
    } catch {
      return null;
    }
  }

  /** Switch the active audit and reload its state. */
  async selectAudit(auditId: string): Promise<void> {
    this.selection.select(auditId);
    await this.bootstrap();
  }

  private updateFinding(id: string, patch: Partial<FieldFinding>): void {
    this.findings.update((list) =>
      list.map((finding) => (finding.id === id ? { ...finding, ...patch, sync: 'queued' } : finding)),
    );
    this.persist();
    this.autoFlush();
  }

  private autoFlush(): void {
    // Defer to syncNow, which branches per mode: live+online replays to the API
    // (real upload); local/offline-demo runs the simulated flush so captures
    // settle to "synced" instead of hanging at "queued"; truly offline waits.
    this.syncNow();
  }

  private async flushLive(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const item of this.items().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('items', item.id, 'syncing');
        try {
          await this.api.putChecklistResult(item.id, { result: item.result, note: item.note });
          this.setSync('items', item.id, 'synced');
        } catch {
          this.setSync('items', item.id, 'queued');
        }
      }
      for (const record of this.evidence().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('evidence', record.id, 'syncing');
        try {
          // Upload the photo blob to Storage first (best-effort), then record the
          // metadata with an `uploaded` flag so readers can fetch a signed URL.
          let uploaded = record.uploaded ?? false;
          if (record.kind === 'photo' && record.blobKey && !uploaded) {
            const blob = await idbGet<Blob>('blobs', record.blobKey);
            if (blob) uploaded = await this.api.uploadEvidencePhoto(record.id, blob);
          }
          const { sync, thumbUrl, blobKey, ...payload } = record;
          void sync;
          void thumbUrl;
          void blobKey;
          await this.api.createEvidence({ ...payload, uploaded });
          this.evidence.update((list) =>
            list.map((entry) => (entry.id === record.id ? { ...entry, uploaded, sync: 'synced' } : entry)),
          );
        } catch {
          this.setSync('evidence', record.id, 'queued');
        }
      }
      for (const finding of this.findings().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('findings', finding.id, 'syncing');
        try {
          const { sync, ...payload } = finding;
          void sync;
          await this.api.upsertFinding(payload);
          this.setSync('findings', finding.id, 'synced');
        } catch {
          this.setSync('findings', finding.id, 'queued');
        }
      }
      for (const request of this.evidenceRequests().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('evidenceRequests', request.id, 'syncing');
        try {
          const { sync, ...payload } = request;
          void sync;
          await this.api.upsertEvidenceRequest(payload);
          this.setSync('evidenceRequests', request.id, 'synced');
        } catch {
          this.setSync('evidenceRequests', request.id, 'queued');
        }
      }
      for (const capa of this.capas().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('capas', capa.id, 'syncing');
        try {
          const { sync, ...payload } = capa;
          void sync;
          await this.api.upsertCapa(payload);
          this.setSync('capas', capa.id, 'synced');
        } catch {
          this.setSync('capas', capa.id, 'queued');
        }
      }
      for (const meeting of this.meetings().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('meetings', meeting.id, 'syncing');
        try {
          const { sync, ...payload } = meeting;
          void sync;
          await this.api.upsertMeeting(payload);
          this.setSync('meetings', meeting.id, 'synced');
        } catch {
          this.setSync('meetings', meeting.id, 'queued');
        }
      }
      const conclusion = this.conclusion();
      if (conclusion && conclusion.sync !== 'synced') {
        try {
          const { sync, ...payload } = conclusion;
          void sync;
          await this.api.saveConclusion(payload);
          this.conclusion.set({ ...conclusion, sync: 'synced' });
        } catch {
          this.conclusion.set({ ...conclusion, sync: 'queued' });
        }
      }
      const reportMeta = this.reportMeta();
      if (reportMeta.sync !== 'synced') {
        try {
          const { sync, ...payload } = reportMeta;
          void sync;
          await this.api.saveReportMeta(payload);
          this.reportMeta.set({ ...reportMeta, sync: 'synced' });
        } catch {
          this.reportMeta.set({ ...reportMeta, sync: 'queued' });
        }
      }
      for (const aspect of this.aspects().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('aspects', aspect.id, 'syncing');
        try {
          const { sync, ...payload } = aspect;
          void sync;
          await this.api.upsertAspect(payload);
          this.setSync('aspects', aspect.id, 'synced');
        } catch {
          this.setSync('aspects', aspect.id, 'queued');
        }
      }
      for (const obligation of this.obligations().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('obligations', obligation.id, 'syncing');
        try {
          const { sync, ...payload } = obligation;
          void sync;
          await this.api.upsertObligation(payload);
          this.setSync('obligations', obligation.id, 'synced');
        } catch {
          this.setSync('obligations', obligation.id, 'queued');
        }
      }
      for (const record of this.emergencyRecords().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('emergency', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertEmergency(payload);
          this.setSync('emergency', record.id, 'synced');
        } catch {
          this.setSync('emergency', record.id, 'queued');
        }
      }
      for (const record of this.interestedParties().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('interestedParties', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertInterestedParty(payload);
          this.setSync('interestedParties', record.id, 'synced');
        } catch {
          this.setSync('interestedParties', record.id, 'queued');
        }
      }
      for (const record of this.objectives().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('objectives', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertObjective(payload);
          this.setSync('objectives', record.id, 'synced');
        } catch {
          this.setSync('objectives', record.id, 'queued');
        }
      }
      for (const record of this.communications().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('communications', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertCommunication(payload);
          this.setSync('communications', record.id, 'synced');
        } catch {
          this.setSync('communications', record.id, 'queued');
        }
      }
      for (const record of this.managementReviews().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('managementReviews', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertManagementReview(payload);
          this.setSync('managementReviews', record.id, 'synced');
        } catch {
          this.setSync('managementReviews', record.id, 'queued');
        }
      }
      for (const record of this.workerConsultations().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('workerConsultations', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertConsultation(payload);
          this.setSync('workerConsultations', record.id, 'synced');
        } catch {
          this.setSync('workerConsultations', record.id, 'queued');
        }
      }
      for (const record of this.risksOpportunities().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('risksOpportunities', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertRiskOpportunity(payload);
          this.setSync('risksOpportunities', record.id, 'synced');
        } catch {
          this.setSync('risksOpportunities', record.id, 'queued');
        }
      }
      for (const record of this.resources().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('resources', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertResource(payload);
          this.setSync('resources', record.id, 'synced');
        } catch {
          this.setSync('resources', record.id, 'queued');
        }
      }
      for (const record of this.competence().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('competence', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertCompetence(payload);
          this.setSync('competence', record.id, 'synced');
        } catch {
          this.setSync('competence', record.id, 'queued');
        }
      }
      for (const record of this.awareness().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('awareness', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertAwareness(payload);
          this.setSync('awareness', record.id, 'synced');
        } catch {
          this.setSync('awareness', record.id, 'queued');
        }
      }
      for (const record of this.documentedInfo().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('documentedInfo', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertDocumentedInfo(payload);
          this.setSync('documentedInfo', record.id, 'synced');
        } catch {
          this.setSync('documentedInfo', record.id, 'queued');
        }
      }
      for (const record of this.performanceMetrics().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('performanceMetrics', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertPerformanceMetric(payload);
          this.setSync('performanceMetrics', record.id, 'synced');
        } catch {
          this.setSync('performanceMetrics', record.id, 'queued');
        }
      }
      for (const record of this.permits().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('permits', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertPermit(payload);
          this.setSync('permits', record.id, 'synced');
        } catch {
          this.setSync('permits', record.id, 'queued');
        }
      }
      for (const record of this.incidents().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('incidents', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertIncident(payload);
          this.setSync('incidents', record.id, 'synced');
        } catch {
          this.setSync('incidents', record.id, 'queued');
        }
      }
      for (const record of this.calibration().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('calibration', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertCalibration(payload);
          this.setSync('calibration', record.id, 'synced');
        } catch {
          this.setSync('calibration', record.id, 'queued');
        }
      }
      for (const record of this.training().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('training', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertTraining(payload);
          this.setSync('training', record.id, 'synced');
        } catch {
          this.setSync('training', record.id, 'queued');
        }
      }
      for (const record of this.suppliers().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('suppliers', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertSupplier(payload);
          this.setSync('suppliers', record.id, 'synced');
        } catch {
          this.setSync('suppliers', record.id, 'queued');
        }
      }
      for (const record of this.changes().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('changes', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertChange(payload);
          this.setSync('changes', record.id, 'synced');
        } catch {
          this.setSync('changes', record.id, 'queued');
        }
      }
      this.persist();
    } finally {
      this.flushing = false;
    }
  }

  private setSync(
    collection:
      | 'items'
      | 'evidence'
      | 'findings'
      | 'evidenceRequests'
      | 'capas'
      | 'meetings'
      | 'aspects'
      | 'obligations'
      | 'emergency'
      | 'interestedParties'
      | 'objectives'
      | 'communications'
      | 'managementReviews'
      | 'workerConsultations'
      | 'risksOpportunities'
      | 'resources'
      | 'competence'
      | 'awareness'
      | 'documentedInfo'
      | 'performanceMetrics'
      | 'permits'
      | 'incidents'
      | 'calibration'
      | 'training'
      | 'suppliers'
      | 'changes',
    id: string,
    sync: SyncState,
  ): void {
    type SyncRecord = { id: string; sync: SyncState };
    const map = {
      items: this.items,
      evidence: this.evidence,
      findings: this.findings,
      evidenceRequests: this.evidenceRequests,
      capas: this.capas,
      meetings: this.meetings,
      aspects: this.aspects,
      obligations: this.obligations,
      emergency: this.emergencyRecords,
      interestedParties: this.interestedParties,
      objectives: this.objectives,
      communications: this.communications,
      managementReviews: this.managementReviews,
      workerConsultations: this.workerConsultations,
      risksOpportunities: this.risksOpportunities,
      resources: this.resources,
      competence: this.competence,
      awareness: this.awareness,
      documentedInfo: this.documentedInfo,
      performanceMetrics: this.performanceMetrics,
      permits: this.permits,
      incidents: this.incidents,
      calibration: this.calibration,
      training: this.training,
      suppliers: this.suppliers,
      changes: this.changes,
    };
    const ref = map[collection] as unknown as {
      update: (fn: (list: SyncRecord[]) => SyncRecord[]) => void;
    };
    ref.update((list) => list.map((record) => (record.id === id ? { ...record, sync } : record)));
  }

  private linkEvidence(itemId: string | undefined, evidenceId: string): void {
    if (!itemId) return;
    this.items.update((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, evidenceIds: [...item.evidenceIds, evidenceId], sync: 'queued' } : item,
      ),
    );
  }

  private tryGeolocate(): Promise<FieldEvidence['geo']> {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: Number(position.coords.latitude.toFixed(5)),
            lng: Number(position.coords.longitude.toFixed(5)),
            accuracyMeters: Math.round(position.coords.accuracy),
          }),
        () => resolve(undefined),
        { timeout: 6000, maximumAge: 300000 },
      );
    });
  }

  private persist(): void {
    const snapshot: PersistedState = {
      items: this.items(),
      evidence: this.evidence().map(({ thumbUrl: _thumbUrl, ...rest }) => rest),
      findings: this.findings(),
      evidenceRequests: this.evidenceRequests(),
      capas: this.capas(),
      auditStatus: this.auditStatus(),
      meetings: this.meetings(),
      conclusion: this.conclusion(),
      aspects: this.aspects(),
      obligations: this.obligations(),
      emergencyRecords: this.emergencyRecords(),
      interestedParties: this.interestedParties(),
      objectives: this.objectives(),
      communications: this.communications(),
      managementReviews: this.managementReviews(),
      workerConsultations: this.workerConsultations(),
      risksOpportunities: this.risksOpportunities(),
      resources: this.resources(),
      competence: this.competence(),
      awareness: this.awareness(),
      documentedInfo: this.documentedInfo(),
      performanceMetrics: this.performanceMetrics(),
      permits: this.permits(),
      incidents: this.incidents(),
      calibration: this.calibration(),
      training: this.training(),
      suppliers: this.suppliers(),
      changes: this.changes(),
      reportMeta: this.reportMeta(),
      reportSignedAt: this.reportSignedAt(),
      reportSignature: this.reportSignature(),
    };
    void idbSet('meta', META_KEY, snapshot);
  }

  /** Try the live API first; on any failure fall back to cached/seeded local state. */
  private async bootstrap(): Promise<void> {
    try {
      const payload = await this.api.getFieldState();
      this.items.set(payload.items.map((item) => ({ ...item, sync: 'synced' as const })));
      this.evidence.set(payload.evidence.map((record) => ({ ...record, sync: 'synced' as const })));
      this.findings.set(payload.findings.map((finding) => ({ ...finding, sync: 'synced' as const })));
      this.evidenceRequests.set((payload.evidenceRequests ?? []).map((req) => ({ ...req, sync: 'synced' as const })));
      this.capas.set((payload.capas ?? []).map((capa) => ({ ...capa, sync: 'synced' as const })));
      this.auditStatus.set(payload.auditStatus ?? 'fieldwork');
      this.meetings.set((payload.meetings ?? []).map((meeting) => ({ ...meeting, sync: 'synced' as const })));
      this.conclusion.set(payload.conclusion ? { ...payload.conclusion, sync: 'synced' } : null);
      this.aspects.set((payload.aspects ?? []).map((a) => ({ ...a, sync: 'synced' as const })));
      this.obligations.set((payload.obligations ?? []).map((o) => ({ ...o, sync: 'synced' as const })));
      this.emergencyRecords.set((payload.emergencyRecords ?? []).map((e) => ({ ...e, sync: 'synced' as const })));
      this.interestedParties.set((payload.interestedParties ?? []).map((p) => ({ ...p, sync: 'synced' as const })));
      this.objectives.set((payload.objectives ?? []).map((o) => ({ ...o, sync: 'synced' as const })));
      this.communications.set((payload.communications ?? []).map((c) => ({ ...c, sync: 'synced' as const })));
      this.managementReviews.set((payload.managementReviews ?? []).map((m) => ({ ...m, sync: 'synced' as const })));
      this.workerConsultations.set((payload.workerConsultations ?? []).map((c) => ({ ...c, sync: 'synced' as const })));
      this.risksOpportunities.set((payload.risksOpportunities ?? []).map((r) => ({ ...r, sync: 'synced' as const })));
      this.resources.set((payload.resources ?? []).map((r) => ({ ...r, sync: 'synced' as const })));
      this.competence.set((payload.competence ?? []).map((c) => ({ ...c, sync: 'synced' as const })));
      this.awareness.set((payload.awareness ?? []).map((a) => ({ ...a, sync: 'synced' as const })));
      this.documentedInfo.set((payload.documentedInfo ?? []).map((d) => ({ ...d, sync: 'synced' as const })));
      this.performanceMetrics.set((payload.performanceMetrics ?? []).map((m) => ({ ...m, sync: 'synced' as const })));
      this.permits.set((payload.permits ?? []).map((p) => ({ ...p, sync: 'synced' as const })));
      this.incidents.set((payload.incidents ?? []).map((i) => ({ ...i, sync: 'synced' as const })));
      this.calibration.set((payload.calibration ?? []).map((c) => ({ ...c, sync: 'synced' as const })));
      this.training.set((payload.training ?? []).map((t) => ({ ...t, sync: 'synced' as const })));
      this.suppliers.set((payload.suppliers ?? []).map((s) => ({ ...s, sync: 'synced' as const })));
      this.changes.set((payload.changes ?? []).map((c) => ({ ...c, sync: 'synced' as const })));
      // Report front-matter: prefer the server copy (shared across the team),
      // falling back to defaults, then overlay scope/dates from the audit record.
      this.reportMeta.set(
        payload.reportMeta
          ? { ...defaultReportMeta(), ...payload.reportMeta, sync: 'synced' }
          : defaultReportMeta(),
      );
      this.changeLog.set(payload.changeLog ?? []);
      if (payload.audit) {
        this.auditee.set(payload.audit.auditee || this.auditee());
        this.criteria.set(payload.audit.criteria || this.criteria());
        const audit = payload.audit;
        this.reportMeta.update((meta) => ({
          ...meta,
          scope: meta.scope || audit.scope || '',
          startsAt: meta.startsAt ?? audit.startsAt,
          endsAt: meta.endsAt ?? audit.endsAt,
        }));
      }
      this.source.set('live');
      this.online.set(true);
      this.persist();
      void this.loadAudits();
    } catch {
      this.source.set('local');
      await this.hydrate();
    }
  }

  private async hydrate(): Promise<void> {
    const saved = await idbGet<PersistedState>('meta', META_KEY);
    if (!saved) return;
    this.items.set(saved.items);
    this.findings.set(saved.findings.map(normalizeFinding));
    this.evidenceRequests.set(saved.evidenceRequests ?? seedEvidenceRequests());
    this.capas.set(saved.capas ?? []);
    this.auditStatus.set(saved.auditStatus ?? 'fieldwork');
    this.meetings.set(saved.meetings ?? []);
    this.conclusion.set(saved.conclusion ?? null);
    this.aspects.set(saved.aspects ?? []);
    this.obligations.set(saved.obligations ?? []);
    this.emergencyRecords.set(saved.emergencyRecords ?? []);
    this.interestedParties.set(saved.interestedParties ?? []);
    this.objectives.set(saved.objectives ?? []);
    this.communications.set(saved.communications ?? []);
    this.managementReviews.set(saved.managementReviews ?? []);
    this.workerConsultations.set(saved.workerConsultations ?? seedConsultations());
    this.risksOpportunities.set(saved.risksOpportunities ?? []);
    this.resources.set(saved.resources ?? []);
    this.competence.set(saved.competence ?? []);
    this.awareness.set(saved.awareness ?? []);
    this.documentedInfo.set(saved.documentedInfo ?? []);
    this.performanceMetrics.set(saved.performanceMetrics ?? seedPerformanceMetrics());
    this.permits.set(saved.permits ?? seedPermits());
    this.incidents.set(saved.incidents ?? seedIncidents());
    this.calibration.set(saved.calibration ?? seedCalibration());
    this.training.set(saved.training ?? seedTraining());
    this.suppliers.set(saved.suppliers ?? seedSuppliers());
    this.changes.set(saved.changes ?? seedChanges());
    if (saved.reportMeta) this.reportMeta.set({ ...defaultReportMeta(), ...saved.reportMeta });
    this.reportSignedAt.set(saved.reportSignedAt ?? null);
    this.reportSignature.set(saved.reportSignature ?? null);
    const restored = await Promise.all(
      saved.evidence.map(async (record) => {
        if (record.kind !== 'photo' || !record.blobKey || typeof URL === 'undefined') return record;
        const blob = await idbGet<Blob>('blobs', record.blobKey);
        return blob ? { ...record, thumbUrl: URL.createObjectURL(blob) } : record;
      }),
    );
    this.evidence.set(restored);
  }
}

const NC_STATUSES: NcStatus[] = ['open', 'responded', 'implemented', 'verified', 'closed', 'rejected', 'reopened'];

/** Map any legacy/persisted finding status onto the nonconformity lifecycle. */
function normalizeFinding(finding: FieldFinding): FieldFinding {
  if (NC_STATUSES.includes(finding.status)) return finding;
  const legacy = finding.status as unknown as string;
  return { ...finding, status: legacy === 'auditorConfirmed' ? 'responded' : 'open' };
}

function deriveCapaStatus(capa: FieldCapa): CapaStatus {
  if (capa.status === 'verified') return 'verified';
  if (capa.implementationEvidenceIds.length > 0) return 'verificationDue';
  if (capa.action && capa.owner && capa.dueDate) return 'inProgress';
  return 'open';
}
