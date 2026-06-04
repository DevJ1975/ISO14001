/**
 * Audit working-papers pack (ISO 45001 cl. 7.5 control of documented information;
 * ISO 19011 reporting & records). A single, self-contained, JSON-serialisable
 * archive of the whole evidence trail for an audit — the durable working papers a
 * certification body retains: audit metadata, checklist results by clause,
 * findings + CAPA, the registers, an evidence index, meetings, the conclusion and
 * the change-log.
 *
 * Privacy/size note: the pack carries evidence METADATA only (labels, timestamps,
 * clause refs, capture details) — never the binary photo/document blobs. It is
 * assembled by the pure `buildWorkingPapers` builder so it can be unit-tested and
 * reproduced deterministically from the store's signals.
 */

/** Current pack schema version. Bump on any breaking shape change. */
export const WORKING_PAPERS_VERSION = 1 as const;

/** Audit identity & front-matter captured at the top of the pack. */
export interface WorkingPapersAudit {
  auditee: string;
  criteria: string;
  auditType?: string;
  scope?: string;
  objectives?: string;
  sites?: string;
  startsAt?: string;
  endsAt?: string;
  leadAuditorName?: string;
  auditorCompetence?: string;
  impartialityDeclared?: boolean;
  distribution?: string;
  reportVersion?: number;
  status?: string;
  signedAt?: string | null;
  /** Integrity fingerprint of the signed report, when signed (hash only — no key material). */
  signatureFingerprint?: string | null;
}

/** One checklist clause result, flattened for the archive. */
export interface WorkingPapersChecklistRow {
  clauseId: string;
  clauseTitle: string;
  question: string;
  ownerName?: string;
  result: string;
  note?: string;
  evidenceIds: string[];
}

/** One finding (nonconformity / OFI / conformity) with its grading & evidence refs. */
export interface WorkingPapersFinding {
  id: string;
  clauseId: string;
  clauseTitle: string;
  type: string;
  status: string;
  description: string;
  requirementSummary?: string;
  objectiveEvidence?: string;
  gradingRationale?: string;
  systemic?: boolean;
  evidenceIds: string[];
  createdByName: string;
  createdAt: string;
}

/** One corrective-action record (correction + root-cause action + verification). */
export interface WorkingPapersCapa {
  id: string;
  findingId: string;
  intent: string;
  correction?: string;
  rootCauseMethod?: string;
  rootCause?: string;
  action?: string;
  owner?: string;
  dueDate?: string;
  status: string;
  verification?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  createdAt: string;
}

/** Evidence index entry — metadata only, never the blob. */
export interface WorkingPapersEvidenceItem {
  id: string;
  kind: string;
  label: string;
  clauseId?: string;
  itemId?: string;
  capturedByName: string;
  capturedAt: string;
  hasPhoto: boolean;
  uploaded?: boolean;
}

/** One opening/closing meeting record. */
export interface WorkingPapersMeeting {
  id: string;
  kind: string;
  datetimeAt: string;
  attendees: string[];
  agendaPoints: string[];
  notes?: string;
  acknowledged: boolean;
}

/** One evidence-request thread, flattened to counts + lifecycle (no blobs). */
export interface WorkingPapersEvidenceRequest {
  id: string;
  title: string;
  clauseId?: string;
  status: string;
  dueDate?: string;
  submissionCount: number;
  messageCount: number;
  createdByName: string;
  createdAt: string;
}

/** The conclusion / recommendation block. */
export interface WorkingPapersConclusion {
  overallConformity: string;
  emsEffectivenessOpinion?: string;
  criteriaMetStatement?: string;
  divergingOpinions?: string;
  recommendation: string;
  updatedAt: string;
}

/** One immutable change-log entry from the backend audit trail. */
export interface WorkingPapersChangeLogEntry {
  id: string;
  actorUid: string;
  action: string;
  target: string;
  targetId?: string;
  at: string;
}

/** Per-section counts, so a reviewer can sanity-check completeness at a glance. */
export interface WorkingPapersCounts {
  checklist: number;
  findings: number;
  capas: number;
  evidence: number;
  evidenceRequests: number;
  meetings: number;
  registers: number;
  changeLog: number;
}

/** The complete, versioned working-papers archive. */
export interface WorkingPapers {
  version: typeof WORKING_PAPERS_VERSION;
  generatedAt: string;
  audit: WorkingPapersAudit;
  checklist: WorkingPapersChecklistRow[];
  findings: WorkingPapersFinding[];
  capas: WorkingPapersCapa[];
  evidence: WorkingPapersEvidenceItem[];
  evidenceRequests: WorkingPapersEvidenceRequest[];
  meetings: WorkingPapersMeeting[];
  /** Registers keyed by name (each an array of structured rows, as-stored). */
  registers: Record<string, readonly unknown[]>;
  conclusion: WorkingPapersConclusion | null;
  changeLog: WorkingPapersChangeLogEntry[];
  counts: WorkingPapersCounts;
}

/** Minimal structural shapes the builder reads — kept local so the builder stays decoupled from the store. */
interface ChecklistItemLike {
  clauseId: string;
  clauseTitle: string;
  question: string;
  ownerName?: string;
  result: string;
  note?: string;
  evidenceIds?: string[];
}

interface FindingLike {
  id: string;
  clauseId: string;
  clauseTitle: string;
  type: string;
  status: string;
  description: string;
  requirementSummary?: string;
  objectiveEvidence?: string;
  gradingRationale?: string;
  systemic?: boolean;
  evidenceIds?: string[];
  createdByName: string;
  createdAt: string;
}

interface CapaLike {
  id: string;
  findingId: string;
  intent: string;
  correction?: string;
  rootCauseMethod?: string;
  rootCause?: string;
  action?: string;
  owner?: string;
  dueDate?: string;
  status: string;
  verification?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  createdAt: string;
}

interface EvidenceLike {
  id: string;
  kind: string;
  label: string;
  clauseId?: string;
  itemId?: string;
  capturedByName: string;
  capturedAt: string;
  blobKey?: string;
  uploaded?: boolean;
}

interface MeetingLike {
  id: string;
  kind: string;
  datetimeAt: string;
  attendees?: string[];
  agendaPoints?: string[];
  notes?: string;
  acknowledged: boolean;
}

interface EvidenceRequestLike {
  id: string;
  title: string;
  clauseId?: string;
  status: string;
  dueDate?: string;
  submissions?: readonly unknown[];
  messages?: readonly unknown[];
  createdByName: string;
  createdAt: string;
}

interface ConclusionLike {
  overallConformity: string;
  emsEffectivenessOpinion?: string;
  criteriaMetStatement?: string;
  divergingOpinions?: string;
  recommendation: string;
  updatedAt: string;
}

interface ChangeLogLike {
  id: string;
  actorUid: string;
  action: string;
  target: string;
  targetId?: string;
  at: string;
}

interface ReportMetaLike {
  auditType?: string;
  scope?: string;
  objectives?: string;
  sites?: string;
  startsAt?: string;
  endsAt?: string;
  leadAuditorName?: string;
  auditorCompetence?: string;
  impartialityDeclared?: boolean;
  distribution?: string;
  reportVersion?: number;
}

/** Input gathered from the field-audit store (signals already read to plain values). */
export interface BuildWorkingPapersInput {
  auditee: string;
  criteria: string;
  reportMeta?: ReportMetaLike | null;
  status?: string;
  signedAt?: string | null;
  signatureFingerprint?: string | null;
  items: readonly ChecklistItemLike[];
  findings: readonly FindingLike[];
  capas: readonly CapaLike[];
  evidence: readonly EvidenceLike[];
  evidenceRequests?: readonly EvidenceRequestLike[];
  meetings?: readonly MeetingLike[];
  registers?: Record<string, readonly unknown[]>;
  conclusion?: ConclusionLike | null;
  changeLog?: readonly ChangeLogLike[];
  /** Override the generation timestamp (defaults to now); injected for deterministic tests. */
  generatedAt?: string;
}

/**
 * Assemble a typed, JSON-serialisable working-papers pack from the audit's data.
 * Pure: no I/O, no store/DOM access — given the same input it returns the same
 * pack (aside from a defaulted `generatedAt`). Evidence is reduced to metadata
 * only; blob keys are dropped and surfaced as a `hasPhoto` flag.
 */
export function buildWorkingPapers(input: BuildWorkingPapersInput): WorkingPapers {
  const meta = input.reportMeta ?? null;

  const checklist: WorkingPapersChecklistRow[] = input.items.map((item) => ({
    clauseId: item.clauseId,
    clauseTitle: item.clauseTitle,
    question: item.question,
    ownerName: item.ownerName || undefined,
    result: item.result,
    note: item.note || undefined,
    evidenceIds: [...(item.evidenceIds ?? [])],
  }));

  const findings: WorkingPapersFinding[] = input.findings.map((f) => ({
    id: f.id,
    clauseId: f.clauseId,
    clauseTitle: f.clauseTitle,
    type: f.type,
    status: f.status,
    description: f.description,
    requirementSummary: f.requirementSummary,
    objectiveEvidence: f.objectiveEvidence,
    gradingRationale: f.gradingRationale,
    systemic: f.systemic,
    evidenceIds: [...(f.evidenceIds ?? [])],
    createdByName: f.createdByName,
    createdAt: f.createdAt,
  }));

  const capas: WorkingPapersCapa[] = input.capas.map((c) => ({
    id: c.id,
    findingId: c.findingId,
    intent: c.intent,
    correction: c.correction,
    rootCauseMethod: c.rootCauseMethod,
    rootCause: c.rootCause,
    action: c.action,
    owner: c.owner,
    dueDate: c.dueDate,
    status: c.status,
    verification: c.verification,
    verifiedByName: c.verifiedByName,
    verifiedAt: c.verifiedAt,
    createdAt: c.createdAt,
  }));

  const evidence: WorkingPapersEvidenceItem[] = input.evidence.map((e) => ({
    id: e.id,
    kind: e.kind,
    label: e.label,
    clauseId: e.clauseId,
    itemId: e.itemId,
    capturedByName: e.capturedByName,
    capturedAt: e.capturedAt,
    hasPhoto: !!e.blobKey,
    uploaded: e.uploaded,
  }));

  const evidenceRequests: WorkingPapersEvidenceRequest[] = (input.evidenceRequests ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    clauseId: r.clauseId,
    status: r.status,
    dueDate: r.dueDate,
    submissionCount: r.submissions?.length ?? 0,
    messageCount: r.messages?.length ?? 0,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
  }));

  const meetings: WorkingPapersMeeting[] = (input.meetings ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    datetimeAt: m.datetimeAt,
    attendees: [...(m.attendees ?? [])],
    agendaPoints: [...(m.agendaPoints ?? [])],
    notes: m.notes,
    acknowledged: m.acknowledged,
  }));

  const registers: Record<string, readonly unknown[]> = {};
  for (const [name, rows] of Object.entries(input.registers ?? {})) {
    if (rows && rows.length) registers[name] = rows;
  }

  const conclusion: WorkingPapersConclusion | null = input.conclusion
    ? {
        overallConformity: input.conclusion.overallConformity,
        emsEffectivenessOpinion: input.conclusion.emsEffectivenessOpinion,
        criteriaMetStatement: input.conclusion.criteriaMetStatement,
        divergingOpinions: input.conclusion.divergingOpinions,
        recommendation: input.conclusion.recommendation,
        updatedAt: input.conclusion.updatedAt,
      }
    : null;

  const changeLog: WorkingPapersChangeLogEntry[] = (input.changeLog ?? []).map((entry) => ({
    id: entry.id,
    actorUid: entry.actorUid,
    action: entry.action,
    target: entry.target,
    targetId: entry.targetId,
    at: entry.at,
  }));

  const registerRowCount = Object.values(registers).reduce((sum, rows) => sum + rows.length, 0);

  return {
    version: WORKING_PAPERS_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    audit: {
      auditee: input.auditee,
      criteria: input.criteria,
      auditType: meta?.auditType,
      scope: meta?.scope || undefined,
      objectives: meta?.objectives || undefined,
      sites: meta?.sites || undefined,
      startsAt: meta?.startsAt,
      endsAt: meta?.endsAt,
      leadAuditorName: meta?.leadAuditorName || undefined,
      auditorCompetence: meta?.auditorCompetence || undefined,
      impartialityDeclared: meta?.impartialityDeclared,
      distribution: meta?.distribution || undefined,
      reportVersion: meta?.reportVersion,
      status: input.status,
      signedAt: input.signedAt ?? null,
      signatureFingerprint: input.signatureFingerprint ?? null,
    },
    checklist,
    findings,
    capas,
    evidence,
    evidenceRequests,
    meetings,
    registers,
    conclusion,
    changeLog,
    counts: {
      checklist: checklist.length,
      findings: findings.length,
      capas: capas.length,
      evidence: evidence.length,
      evidenceRequests: evidenceRequests.length,
      meetings: meetings.length,
      registers: registerRowCount,
      changeLog: changeLog.length,
    },
  };
}

/** Flat CSV column spec for the findings summary section of the working-papers pack. */
export interface WorkingPapersFindingCsvRow {
  clauseId: string;
  clauseTitle: string;
  type: string;
  status: string;
  description: string;
  systemic: string;
  evidenceCount: number;
  createdByName: string;
  createdAt: string;
}

/** Flatten the pack's findings into CSV-ready rows (used for the optional flat summary). */
export function workingPapersFindingRows(pack: WorkingPapers): WorkingPapersFindingCsvRow[] {
  return pack.findings.map((f) => ({
    clauseId: f.clauseId,
    clauseTitle: f.clauseTitle,
    type: f.type,
    status: f.status,
    description: f.description,
    systemic: f.systemic ? 'yes' : 'no',
    evidenceCount: f.evidenceIds.length,
    createdByName: f.createdByName,
    createdAt: f.createdAt,
  }));
}
