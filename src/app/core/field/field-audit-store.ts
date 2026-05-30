import { Injectable, computed, inject, signal } from '@angular/core';

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

/** Documented information & its control (ISO 14001 cl. 7.5). */
export interface DocumentedInfoRecord {
  id: string;
  document: string;
  docType?: string;
  controlStatus: 'controlled' | 'uncontrolled' | 'draft' | 'obsolete';
  retention?: string;
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
  reportMeta: ReportMeta;
  reportSignedAt: string | null;
}

const AUDIT_STATUS_ORDER: AuditStatus[] = ['draft', 'planned', 'fieldwork', 'reporting', 'followUp', 'closed', 'archived'];

const META_KEY = 'state';
const AUDITOR = 'Ava Brooks';

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
  readonly documentedInfo = signal<DocumentedInfoRecord[]>([]);
  readonly reportMeta = signal<ReportMeta>(defaultReportMeta());
  readonly reportSignedAt = signal<string | null>(null);
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
      { id: uid('doc'), document: '', controlStatus: 'controlled', result: 'notStarted', updatedAt: new Date().toISOString(), sync: 'queued' },
      ...list,
    ]);
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

  /** Lead-auditor sign-off. Persisted to the server when live; recorded locally otherwise. */
  async signOff(attestation: string): Promise<boolean> {
    if (this.source() === 'live' && this.online()) {
      try {
        const result = (await this.api.signReport({ attestation })) as { signedAt?: string };
        this.reportSignedAt.set(result?.signedAt ?? new Date().toISOString());
        this.persist();
        return true;
      } catch {
        return false;
      }
    }
    this.reportSignedAt.set(new Date().toISOString());
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
    this.documentedInfo.set([]);
    this.reportMeta.set(defaultReportMeta());
    this.reportSignedAt.set(null);
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
      | 'documentedInfo',
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
      evidence: this.evidence().map(({ thumbUrl, ...rest }) => rest),
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
      reportMeta: this.reportMeta(),
      reportSignedAt: this.reportSignedAt(),
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
      // Report front-matter: prefer the server copy (shared across the team),
      // falling back to defaults, then overlay scope/dates from the audit record.
      this.reportMeta.set(
        payload.reportMeta
          ? { ...defaultReportMeta(), ...payload.reportMeta, sync: 'synced' }
          : defaultReportMeta(),
      );
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
    if (saved.reportMeta) this.reportMeta.set({ ...defaultReportMeta(), ...saved.reportMeta });
    this.reportSignedAt.set(saved.reportSignedAt ?? null);
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
