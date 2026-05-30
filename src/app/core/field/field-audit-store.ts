import { Injectable, computed, inject, signal } from '@angular/core';

import { FieldApiService } from './field-api.service';
import { idbDelete, idbGet, idbSet } from './idb';

export type SyncState = 'synced' | 'queued' | 'syncing' | 'conflict';
export type FieldResult = 'notStarted' | 'conform' | 'minorNc' | 'majorNc' | 'ofi' | 'na';
export type EvidenceKind = 'photo' | 'note';
export type FindingType = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';
/** Nonconformity lifecycle (ISO 14001 cl. 10.2 close-out flow). */
export type NcStatus = 'open' | 'responded' | 'implemented' | 'verified' | 'closed' | 'rejected' | 'reopened';
export type CapaStatus = 'open' | 'inProgress' | 'verificationDue' | 'verified' | 'overdue';
export type DataSource = 'local' | 'live';

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
  reportSignedAt: string | null;
}

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

  readonly auditee = 'Northstar Components — Denver Assembly Plant';
  readonly criteria = 'ISO 14001:2026';

  readonly items = signal<FieldChecklistItem[]>(seedItems());
  readonly evidence = signal<FieldEvidence[]>(seedEvidence());
  readonly findings = signal<FieldFinding[]>(seedFindings());
  readonly capas = signal<FieldCapa[]>(seedCapas());
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
      this.capas().filter((c) => c.sync !== 'synced').length,
  );

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

  signReport(): void {
    this.reportSignedAt.set(new Date().toISOString());
    this.persist();
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

    setTimeout(() => {
      const toSynced = <T extends { sync: SyncState }>(record: T): T =>
        record.sync === 'syncing' ? { ...record, sync: 'synced' } : record;
      this.items.update((list) => list.map(toSynced));
      this.evidence.update((list) => list.map(toSynced));
      this.findings.update((list) => list.map(toSynced));
      this.capas.update((list) => list.map(toSynced));
      this.persist();
    }, 900);
  }

  async resetDemo(): Promise<void> {
    this.items.set(seedItems());
    this.evidence.set(seedEvidence());
    this.findings.set(seedFindings());
    this.capas.set(seedCapas());
    this.reportSignedAt.set(null);
    await idbDelete('meta', META_KEY);
  }

  /** Re-fetch from the live API (e.g. after sign-in), falling back to local state. */
  async reload(): Promise<void> {
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
    if (this.source() === 'live' && this.online()) {
      void this.flushLive();
    }
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
          const { sync, thumbUrl, blobKey, ...payload } = record;
          void sync;
          void thumbUrl;
          void blobKey;
          await this.api.createEvidence(payload);
          this.setSync('evidence', record.id, 'synced');
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
      this.persist();
    } finally {
      this.flushing = false;
    }
  }

  private setSync(collection: 'items' | 'evidence' | 'findings' | 'capas', id: string, sync: SyncState): void {
    type SyncRecord = { id: string; sync: SyncState };
    const map = { items: this.items, evidence: this.evidence, findings: this.findings, capas: this.capas };
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
      this.source.set('live');
      this.online.set(true);
      this.persist();
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
