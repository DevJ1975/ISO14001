import { Injectable, computed, inject, signal } from '@angular/core';

import { ReportSignature, SignableReport, reportContentHash } from '../domain';
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
/** Nonconformity lifecycle (ISO 14001 cl. 10.2 close-out flow). */
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
 * Report front-matter expected on a UKAS-style ISO 14001 report (audit type,
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

export interface EnvironmentalAspect {
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

/** Interested parties & their needs (ISO 14001 cl. 4.2). */
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

/** Environmental objectives & targets with progress (ISO 14001 cl. 6.2). */
export interface EnvironmentalObjective {
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

/** Internal & external communication (ISO 14001 cl. 7.4). */
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

/** Management review inputs, decisions & outputs (ISO 14001 cl. 9.3). */
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

/** Risks & opportunities and their treatment (ISO 14001 cl. 6.1.1). */
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

/** Resources provided for the EMS (ISO 14001 cl. 7.1). */
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

/** Competence & training under the EMS (ISO 14001 cl. 7.2). */
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

/** Awareness of policy, aspects and roles (ISO 14001 cl. 7.3). */
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

/** Documented information & its control (ISO 14001 cl. 7.5). */
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

/** Environmental permit, licence or consent with renewal/expiry (ISO 14001 cl. 6.1.3 / 9.1.2). */
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

/** Training matrix entry — per-person training with renewal/expiry (ISO 14001 cl. 7.2). */
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

/** Supplier / contractor evaluation (ISO 14001 cl. 8.1 — control of outsourced processes & procurement). */
export interface SupplierRecord {
  id: string;
  name: string;
  serviceType?: string;
  category: 'supplier' | 'contractor' | 'wasteCarrier' | 'recycler' | 'other';
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

/** Management of Change (ISO 14001 cl. 8.1 — control of planned changes & their environmental consequences). */
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

/** Greenhouse-gas (carbon) inventory entry by GHG Protocol scope (ISO 14001 cl. 9.1 / 6.1.2). */
export interface CarbonEntry {
  id: string;
  source: string;
  scope: 1 | 2 | 3;
  category?: string;
  period?: string;
  activityData?: number;
  activityUnit?: string;
  emissionFactor?: number;
  tco2eOverride?: number;
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Monitoring & measuring equipment calibration (ISO 14001 cl. 9.1.1). */
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

/** Environmental incident / near-miss (logged occurrence; ISO 14001 cl. 10.2 / 8.2). */
export interface EnvironmentalIncident {
  id: string;
  title: string;
  occurredAt?: string;
  location?: string;
  incidentType: 'spill' | 'release' | 'exceedance' | 'wasteBreach' | 'complaint' | 'nearMiss' | 'other';
  severity: 'low' | 'medium' | 'high';
  description?: string;
  immediateAction?: string;
  rootCause?: string;
  correctiveActionRef?: string;
  reportableToRegulator?: boolean;
  status: 'open' | 'investigating' | 'actioned' | 'closed';
  result: RegisterResult;
  updatedAt: string;
  sync: SyncState;
}

/** Environmental performance indicator — monitoring & measurement (ISO 14001 cl. 9.1.1). */
export interface PerformanceMetric {
  id: string;
  indicator: string;
  category: 'energy' | 'water' | 'waste' | 'emissions' | 'materials' | 'effluent' | 'other';
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

/** Corrective-action record (ISO 14001 cl. 10.2): correction vs corrective action + effectiveness verification. */
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
  capas: FieldCapa[];
  auditStatus: AuditStatus;
  meetings: AuditMeeting[];
  conclusion: AuditConclusion | null;
  aspects: EnvironmentalAspect[];
  obligations: ComplianceObligation[];
  emergencyRecords: EmergencyRecord[];
  interestedParties: InterestedParty[];
  objectives: EnvironmentalObjective[];
  communications: CommunicationRecord[];
  managementReviews: ManagementReviewRecord[];
  risksOpportunities: RiskOpportunity[];
  resources: ResourceRecord[];
  competence: CompetenceRecord[];
  awareness: AwarenessRecord[];
  documentedInfo: DocumentedInfoRecord[];
  performanceMetrics: PerformanceMetric[];
  permits: Permit[];
  incidents: EnvironmentalIncident[];
  calibration: CalibrationRecord[];
  training: TrainingRecord[];
  suppliers: SupplierRecord[];
  changes: ManagementOfChangeRecord[];
  carbon: CarbonEntry[];
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
    base({ equipment: 'Stack gas analyser', identifier: 'AN-204', parameter: 'NOx / CO', lastCalibratedAt: '2026-01-15', nextDueAt: '2027-01-15', frequencyMonths: 12, result: 'conforming' }),
    base({ equipment: 'Effluent pH meter', identifier: 'PH-11', parameter: 'pH', lastCalibratedAt: '2025-12-01', nextDueAt: '2026-06-25', frequencyMonths: 6, result: 'needsFollowUp' }),
    base({ equipment: 'Noise level meter', identifier: 'NL-03', parameter: 'dB(A)', lastCalibratedAt: '2025-02-01', nextDueAt: '2026-02-01', frequencyMonths: 12, result: 'nonconforming' }),
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
    base({ document: 'Environmental policy', docType: 'Policy', controlStatus: 'controlled', version: 'v3.0', owner: 'EHS Manager', lastReviewedAt: '2025-10-01', nextReviewAt: '2026-10-01', reviewFrequencyMonths: 12, retention: 'Indefinite', result: 'conforming' }),
    base({ document: 'Aspects & impacts procedure', docType: 'Procedure', controlStatus: 'controlled', version: 'v2.1', owner: 'EHS Lead', lastReviewedAt: '2025-06-20', nextReviewAt: '2026-06-20', reviewFrequencyMonths: 12, result: 'needsFollowUp' }),
    base({ document: 'Emergency preparedness plan', docType: 'Plan', controlStatus: 'controlled', version: 'v1.4', owner: 'Site Manager', lastReviewedAt: '2024-12-01', nextReviewAt: '2025-12-01', reviewFrequencyMonths: 12, result: 'nonconforming' }),
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
    base({ person: 'J. Okafor', role: 'EHS lead', course: 'ISO 14001 internal auditor', completedAt: '2025-09-10', expiresAt: '2028-09-10', frequencyMonths: 36, mandatory: true, result: 'conforming' }),
    base({ person: 'M. Silva', role: 'Press operator', course: 'Spill response', completedAt: '2025-07-01', expiresAt: '2026-07-01', frequencyMonths: 12, mandatory: true, result: 'needsFollowUp' }),
    base({ person: 'R. Adeyemi', role: 'Forklift driver', course: 'Forklift / FLT licence', completedAt: '2024-02-20', expiresAt: '2026-02-20', frequencyMonths: 24, mandatory: true, result: 'nonconforming' }),
    base({ person: 'L. Chen', role: 'Lab technician', course: 'Hazardous waste handling', completedAt: '2026-03-15', frequencyMonths: 0, mandatory: false, result: 'conforming' }),
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
    base({ name: 'GreenWaste Carriers Ltd', serviceType: 'Hazardous waste collection', category: 'wasteCarrier', environmentallyRelevant: true, controlsCommunicated: true, rating: 'approved', lastEvaluatedAt: '2026-01-10', nextEvaluationAt: '2027-01-10', evaluationFrequencyMonths: 12, result: 'conforming' }),
    base({ name: 'Solvent Supplies Co', serviceType: 'Chemical supplier', category: 'supplier', environmentallyRelevant: true, controlsCommunicated: true, rating: 'conditional', lastEvaluatedAt: '2025-07-01', nextEvaluationAt: '2026-07-01', evaluationFrequencyMonths: 12, result: 'needsFollowUp', notes: 'SDS pack incomplete; chase updated documentation.' }),
    base({ name: 'ACME Site Maintenance', serviceType: 'On-site maintenance contractor', category: 'contractor', environmentallyRelevant: true, controlsCommunicated: false, rating: 'approved', lastEvaluatedAt: '2025-01-15', nextEvaluationAt: '2026-01-15', evaluationFrequencyMonths: 12, result: 'nonconforming', notes: 'Re-evaluation overdue; environmental controls not re-communicated.' }),
    base({ name: 'CircularPack Recyclers', serviceType: 'Packaging recycling', category: 'recycler', environmentallyRelevant: true, controlsCommunicated: false, rating: 'notRated', result: 'needsFollowUp', notes: 'New supplier — initial environmental evaluation outstanding.' }),
    base({ name: 'Citywide Stationery', serviceType: 'Office supplies', category: 'supplier', environmentallyRelevant: false, rating: 'notRated', result: 'notApplicable' }),
  ];
}

/** Demonstration management-of-change records — on-track, aspects-outstanding and overdue. */
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
    base({ title: 'New solvent recovery still', description: 'Install closed-loop solvent recovery on line 2.', changeType: 'equipment', status: 'assessing', aspectsReviewed: true, riskLevel: 'medium', owner: 'Process Eng.', controls: 'New air-emissions point; permit variation in progress.', targetDate: '2026-08-31', result: 'needsFollowUp' }),
    base({ title: 'Switch degreaser to water-based', description: 'Substitute chlorinated degreaser with aqueous product.', changeType: 'material', status: 'implemented', aspectsReviewed: false, riskLevel: 'high', owner: 'EHS Lead', implementedAt: '2026-05-20', result: 'nonconforming', controls: 'Implemented before aspects/impacts reassessment — gap.' }),
    base({ title: 'Reorganise waste storage area', description: 'Relocate hazardous-waste store nearer the dock.', changeType: 'organisational', status: 'approved', aspectsReviewed: true, riskLevel: 'low', owner: 'Site Manager', targetDate: '2026-04-30', result: 'needsFollowUp', controls: 'Bunding and signage specified; target date passed.' }),
    base({ title: 'New packaging EPR reporting rules', description: 'Adapt to updated producer-responsibility regulations.', changeType: 'regulatory', status: 'closed', aspectsReviewed: true, riskLevel: 'low', owner: 'Compliance', implementedAt: '2026-02-15', result: 'conforming' }),
  ];
}

/** Demonstration carbon inventory — Scope 1/2/3 sources with activity data & factors. */
function seedCarbon(): CarbonEntry[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<CarbonEntry>): CarbonEntry => ({
    id: uid('carbon'),
    source: '',
    scope: 1,
    period: 'FY2025',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ source: 'Natural gas — boilers', scope: 1, category: 'Stationary combustion', activityData: 4200, activityUnit: 'MWh', emissionFactor: 183, result: 'conforming' }),
    base({ source: 'Diesel — site fleet', scope: 1, category: 'Mobile combustion', activityData: 38000, activityUnit: 'litres', emissionFactor: 2.51, result: 'conforming' }),
    base({ source: 'Purchased electricity', scope: 2, category: 'Location-based', activityData: 5600, activityUnit: 'MWh', emissionFactor: 207, result: 'needsFollowUp' }),
    base({ source: 'Business travel — air', scope: 3, category: 'Cat 6 travel', activityData: 410000, activityUnit: 'passenger-km', emissionFactor: 0.18, result: 'needsFollowUp' }),
    base({ source: 'Waste to landfill', scope: 3, category: 'Cat 5 waste', activityData: 320, activityUnit: 'tonnes', emissionFactor: 458, result: 'notStarted' }),
  ];
}

/** Demonstration incidents — an open high-severity spill and a closed near-miss. */
function seedIncidents(): EnvironmentalIncident[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<EnvironmentalIncident>): EnvironmentalIncident => ({
    id: uid('incident'),
    title: '',
    incidentType: 'spill',
    severity: 'low',
    status: 'open',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ title: 'Hydraulic oil spill at press 3', occurredAt: '2026-05-12', location: 'Assembly hall', incidentType: 'spill', severity: 'high', status: 'investigating', result: 'needsFollowUp', immediateAction: 'Bunded and absorbed; ~20 L to interceptor isolated.', reportableToRegulator: false }),
    base({ title: 'Near-miss: uncapped solvent drum', occurredAt: '2026-04-28', location: 'Paint store', incidentType: 'nearMiss', severity: 'low', status: 'closed', result: 'conforming', rootCause: 'Decanting procedure not followed; retraining completed.' }),
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
    base({ title: 'Environmental permit — installation', permitType: 'permit', reference: 'EPR/AB1234CD', issuingAuthority: 'Environment Agency', issuedAt: '2022-04-01', expiresAt: '2027-09-30', complianceStatus: 'compliant', result: 'conforming', conditionsSummary: 'Emission limits, monitoring and reporting conditions.', monitoringRequirements: 'Quarterly stack testing; annual return.' }),
    base({ title: 'Trade effluent consent', permitType: 'consent', reference: 'TE-2024-117', issuingAuthority: 'Water utility', issuedAt: '2024-07-01', expiresAt: '2026-08-15', complianceStatus: 'toVerify', result: 'needsFollowUp', monitoringRequirements: 'Monthly composite sampling of pH and COD.' }),
    base({ title: 'Hazardous-waste carrier registration', permitType: 'registration', reference: 'CBDU-998877', issuingAuthority: 'Environment Agency', issuedAt: '2023-03-01', expiresAt: '2026-02-28', complianceStatus: 'nonCompliant', result: 'nonconforming', conditionsSummary: 'Upper-tier carrier registration; renew before expiry.' }),
  ];
}

/** Demonstration 9.1 performance data — energy/water/waste/emissions with a target miss and a worsening trend. */
function seedPerformanceMetrics(): PerformanceMetric[] {
  const now = '2026-06-15T15:00:00.000Z';
  const base = (extra: Partial<PerformanceMetric>): PerformanceMetric => ({
    id: uid('metric'),
    indicator: '',
    category: 'energy',
    unit: '',
    period: '2025',
    trend: 'notEvaluated',
    result: 'notStarted',
    updatedAt: now,
    sync: 'synced',
    ...extra,
  });
  return [
    base({ indicator: 'Grid electricity', category: 'energy', unit: 'MWh', baselineValue: 1320, targetValue: 1200, actualValue: 1185, trend: 'improving', result: 'conforming', monitoringMethod: 'Half-hourly meter readings, monthly reconciliation' }),
    base({ indicator: 'Mains water', category: 'water', unit: 'm³', baselineValue: 8600, targetValue: 8000, actualValue: 8420, trend: 'worsening', result: 'needsFollowUp', evaluationNotes: 'Above target; suspected cooling-tower leak under investigation.' }),
    base({ indicator: 'Hazardous waste', category: 'waste', unit: 't', baselineValue: 14.2, targetValue: 12, actualValue: 11.4, trend: 'improving', result: 'conforming' }),
    base({ indicator: 'Scope 1 emissions', category: 'emissions', unit: 'tCO₂e', baselineValue: 540, targetValue: 500, actualValue: 512, trend: 'stable', result: 'needsFollowUp' }),
  ];
}

function seedItems(): FieldChecklistItem[] {
  const now = '2026-06-15T15:00:00.000Z';
  return [
    {
      id: 'item-4',
      clauseId: '4',
      clauseTitle: 'Context of the organization',
      question: 'What internal and external EMS context changes should the team verify during this audit?',
      guidance: 'Use auditee-authored context records, interviews, and site observations.',
      ownerName: 'Maya Chen',
      result: 'conform',
      evidenceIds: [],
      sync: 'synced',
      updatedAt: now,
    },
    {
      id: 'item-6',
      clauseId: '6',
      clauseTitle: 'Planning',
      question: 'Which planned controls, objectives, and evidence sources should be sampled for transition readiness?',
      guidance: 'Keep the prompt tied to auditee records and avoid copying standard text.',
      ownerName: 'Omar Patel',
      result: 'ofi',
      note: 'Objective tracking evidence partially available; confirm before signoff.',
      evidenceIds: ['evidence-seed-note'],
      sync: 'synced',
      updatedAt: now,
    },
    {
      id: 'item-8',
      clauseId: '8',
      clauseTitle: 'Operation',
      question: 'Which operational controls should be observed, photographed, or sampled during fieldwork?',
      guidance: 'Use photo evidence only where site rules allow it.',
      ownerName: 'Ava Brooks',
      result: 'notStarted',
      evidenceIds: [],
      sync: 'synced',
      updatedAt: now,
    },
  ];
}

function seedEvidence(): FieldEvidence[] {
  return [
    {
      id: 'evidence-seed-note',
      kind: 'note',
      itemId: 'item-6',
      clauseId: '6',
      label: 'Interviewed EHS manager about transition planning records; objective tracking needs follow-up.',
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
      description: 'Environmental objective tracking for 2026 transition is not fully evidenced.',
      requirementSummary: 'Cl. 6.2 — establish, monitor and retain documented information on environmental objectives.',
      objectiveEvidence: 'Objectives register shows 2 of 5 objectives without progress records for the current period.',
      gradingRationale: 'Isolated lapse on a subset of objectives; does not undermine the EMS overall — minor.',
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
  readonly criteria = signal('ISO 14001:2026');
  readonly audits = signal<AuditSummary[]>([]);
  readonly selectedAuditId = this.selection.selectedAuditId;

  readonly items = signal<FieldChecklistItem[]>(seedItems());
  readonly evidence = signal<FieldEvidence[]>(seedEvidence());
  readonly findings = signal<FieldFinding[]>(seedFindings());
  readonly capas = signal<FieldCapa[]>(seedCapas());
  readonly auditStatus = signal<AuditStatus>('fieldwork');
  readonly meetings = signal<AuditMeeting[]>([]);
  readonly conclusion = signal<AuditConclusion | null>(null);
  readonly aspects = signal<EnvironmentalAspect[]>([]);
  readonly obligations = signal<ComplianceObligation[]>([]);
  readonly emergencyRecords = signal<EmergencyRecord[]>([]);
  readonly interestedParties = signal<InterestedParty[]>([]);
  readonly objectives = signal<EnvironmentalObjective[]>([]);
  readonly communications = signal<CommunicationRecord[]>([]);
  readonly managementReviews = signal<ManagementReviewRecord[]>([]);
  readonly risksOpportunities = signal<RiskOpportunity[]>([]);
  readonly resources = signal<ResourceRecord[]>([]);
  readonly competence = signal<CompetenceRecord[]>([]);
  readonly awareness = signal<AwarenessRecord[]>([]);
  readonly documentedInfo = signal<DocumentedInfoRecord[]>(seedDocumentedInfo());
  readonly performanceMetrics = signal<PerformanceMetric[]>(seedPerformanceMetrics());
  readonly permits = signal<Permit[]>(seedPermits());
  readonly incidents = signal<EnvironmentalIncident[]>(seedIncidents());
  readonly calibration = signal<CalibrationRecord[]>(seedCalibration());
  readonly training = signal<TrainingRecord[]>(seedTraining());
  readonly suppliers = signal<SupplierRecord[]>(seedSuppliers());
  readonly changes = signal<ManagementOfChangeRecord[]>(seedChanges());
  readonly carbon = signal<CarbonEntry[]>(seedCarbon());
  readonly reportMeta = signal<ReportMeta>(defaultReportMeta());
  /** Read-only audit trail from the backend (not synced upward). */
  readonly changeLog = signal<ChangeLogEntry[]>([]);
  readonly reportSignedAt = signal<string | null>(null);
  /** Tamper-evident e-signature captured at sign-off (signer, attestation, content hash). */
  readonly reportSignature = signal<ReportSignature | null>(null);
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
      this.capas().filter((c) => c.sync !== 'synced').length +
      this.meetings().filter((m) => m.sync !== 'synced').length +
      this.aspects().filter((a) => a.sync !== 'synced').length +
      this.obligations().filter((o) => o.sync !== 'synced').length +
      this.emergencyRecords().filter((e) => e.sync !== 'synced').length +
      this.interestedParties().filter((p) => p.sync !== 'synced').length +
      this.objectives().filter((o) => o.sync !== 'synced').length +
      this.communications().filter((c) => c.sync !== 'synced').length +
      this.managementReviews().filter((m) => m.sync !== 'synced').length +
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
      this.carbon().filter((c) => c.sync !== 'synced').length +
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

  updateAspect(id: string, patch: Partial<EnvironmentalAspect>): void {
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

  updateObjective(id: string, patch: Partial<EnvironmentalObjective>): void {
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
      { id: uid('metric'), indicator: '', category: 'energy', unit: '', period: '', trend: 'notEvaluated', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
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
      { id: uid('incident'), title: '', incidentType: 'spill', severity: 'low', status: 'open', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateIncident(id: string, patch: Partial<EnvironmentalIncident>): void {
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

  addCarbon(): void {
    this.carbon.update((list) => [
      { id: uid('carbon'), source: '', scope: 1, result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
    this.persist();
    this.autoFlush();
  }

  updateCarbon(id: string, patch: Partial<CarbonEntry>): void {
    this.carbon.update((list) =>
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
    this.capas.update((list) => list.map(toSyncing));
    this.meetings.update((list) => list.map(toSyncing));

    setTimeout(() => {
      const toSynced = <T extends { sync: SyncState }>(record: T): T =>
        record.sync === 'syncing' ? { ...record, sync: 'synced' } : record;
      this.items.update((list) => list.map(toSynced));
      this.evidence.update((list) => list.map(toSynced));
      this.findings.update((list) => list.map(toSynced));
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
    this.carbon.set(seedCarbon());
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
      for (const record of this.carbon().filter((entry) => entry.sync !== 'synced')) {
        this.setSync('carbon', record.id, 'syncing');
        try {
          const { sync, ...payload } = record;
          void sync;
          await this.api.upsertCarbon(payload);
          this.setSync('carbon', record.id, 'synced');
        } catch {
          this.setSync('carbon', record.id, 'queued');
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
      | 'capas'
      | 'meetings'
      | 'aspects'
      | 'obligations'
      | 'emergency'
      | 'interestedParties'
      | 'objectives'
      | 'communications'
      | 'managementReviews'
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
      | 'changes'
      | 'carbon',
    id: string,
    sync: SyncState,
  ): void {
    type SyncRecord = { id: string; sync: SyncState };
    const map = {
      items: this.items,
      evidence: this.evidence,
      findings: this.findings,
      capas: this.capas,
      meetings: this.meetings,
      aspects: this.aspects,
      obligations: this.obligations,
      emergency: this.emergencyRecords,
      interestedParties: this.interestedParties,
      objectives: this.objectives,
      communications: this.communications,
      managementReviews: this.managementReviews,
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
      carbon: this.carbon,
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
      carbon: this.carbon(),
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
      this.carbon.set((payload.carbon ?? []).map((c) => ({ ...c, sync: 'synced' as const })));
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
    this.carbon.set(saved.carbon ?? seedCarbon());
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
