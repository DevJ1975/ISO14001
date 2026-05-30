import { Injectable, computed, inject, signal } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import { FieldApiService } from './field-api.service';
import { idbDelete, idbGet, idbSet } from './idb';

export type SyncState = 'synced' | 'queued' | 'syncing' | 'conflict';
export type FieldResult = 'notStarted' | 'conform' | 'minorNc' | 'majorNc' | 'ofi' | 'na';
export type EvidenceKind = 'photo' | 'note';
export type FindingType = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';
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

export interface FieldFinding {
  id: string;
  clauseId: string;
  clauseTitle: string;
  type: FindingType;
  description: string;
  evidenceIds: string[];
  status: 'draft' | 'auditorConfirmed';
  createdByName: string;
  createdAt: string;
  sync: SyncState;
}

interface PersistedState {
  items: FieldChecklistItem[];
  evidence: FieldEvidence[];
  findings: FieldFinding[];
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
      type: 'ofi',
      description: 'Transition planning evidence is partially available and should be completed before report signoff.',
      evidenceIds: ['evidence-seed-note'],
      status: 'draft',
      createdByName: 'Omar Patel',
      createdAt: '2026-06-15T18:40:00.000Z',
      sync: 'synced',
    },
  ];
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
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
  private readonly config = inject(APP_CONFIG);

  readonly auditee = 'Northstar Components — Denver Assembly Plant';
  readonly criteria = 'ISO 14001:2026';

  readonly items = signal<FieldChecklistItem[]>(seedItems());
  readonly evidence = signal<FieldEvidence[]>(seedEvidence());
  readonly findings = signal<FieldFinding[]>(seedFindings());
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
      this.findings().filter((f) => f.sync !== 'synced').length,
  );

  readonly resultTotals = computed(() => {
    const totals: Record<FieldResult, number> = { notStarted: 0, conform: 0, minorNc: 0, majorNc: 0, ofi: 0, na: 0 };
    for (const item of this.items()) totals[item.result] += 1;
    return totals;
  });

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

  promoteToFinding(itemId: string, type: FindingType, description: string): void {
    const item = this.items().find((entry) => entry.id === itemId);
    if (!item) return;
    const finding: FieldFinding = {
      id: uid('finding'),
      clauseId: item.clauseId,
      clauseTitle: item.clauseTitle,
      type,
      description,
      evidenceIds: [...item.evidenceIds],
      status: 'draft',
      createdByName: AUDITOR,
      createdAt: new Date().toISOString(),
      sync: 'queued',
    };
    this.findings.update((list) => [finding, ...list]);
    this.persist();
    this.autoFlush();
  }

  confirmFinding(id: string): void {
    this.findings.update((list) =>
      list.map((finding) =>
        finding.id === id ? { ...finding, status: 'auditorConfirmed', sync: 'queued' } : finding,
      ),
    );
    this.persist();
    this.autoFlush();
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

    setTimeout(() => {
      const toSynced = <T extends { sync: SyncState }>(record: T): T =>
        record.sync === 'syncing' ? { ...record, sync: 'synced' } : record;
      this.items.update((list) => list.map(toSynced));
      this.evidence.update((list) => list.map(toSynced));
      this.findings.update((list) => list.map(toSynced));
      this.persist();
    }, 900);
  }

  async resetDemo(): Promise<void> {
    this.items.set(seedItems());
    this.evidence.set(seedEvidence());
    this.findings.set(seedFindings());
    this.reportSignedAt.set(null);
    await idbDelete('meta', META_KEY);
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
        this.setItemSync(item.id, 'syncing');
        try {
          await this.api.putChecklistResult(item.id, { result: item.result, note: item.note });
          this.setItemSync(item.id, 'synced');
        } catch {
          this.setItemSync(item.id, 'queued');
        }
      }
      for (const record of this.evidence().filter((entry) => entry.sync !== 'synced')) {
        this.setEvidenceSync(record.id, 'syncing');
        try {
          const { sync, thumbUrl, blobKey, ...payload } = record;
          void sync;
          void thumbUrl;
          void blobKey;
          await this.api.createEvidence(payload);
          this.setEvidenceSync(record.id, 'synced');
        } catch {
          this.setEvidenceSync(record.id, 'queued');
        }
      }
      for (const finding of this.findings().filter((entry) => entry.sync !== 'synced')) {
        this.setFindingSync(finding.id, 'syncing');
        try {
          const { sync, status, ...payload } = finding;
          void sync;
          await this.api.createFinding(payload);
          if (status === 'auditorConfirmed') {
            await this.api.confirmFinding(finding.id);
          }
          this.setFindingSync(finding.id, 'synced');
        } catch {
          this.setFindingSync(finding.id, 'queued');
        }
      }
      this.persist();
    } finally {
      this.flushing = false;
    }
  }

  private setItemSync(id: string, sync: SyncState): void {
    this.items.update((list) => list.map((item) => (item.id === id ? { ...item, sync } : item)));
  }

  private setEvidenceSync(id: string, sync: SyncState): void {
    this.evidence.update((list) => list.map((record) => (record.id === id ? { ...record, sync } : record)));
  }

  private setFindingSync(id: string, sync: SyncState): void {
    this.findings.update((list) => list.map((finding) => (finding.id === id ? { ...finding, sync } : finding)));
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
      reportSignedAt: this.reportSignedAt(),
    };
    void idbSet('meta', META_KEY, snapshot);
  }

  /** Try the live API first; on any failure fall back to cached/seeded local state. */
  private async bootstrap(): Promise<void> {
    if (this.config.sendDevAuthHeaders === false) {
      await this.hydrate();
      return;
    }
    try {
      const payload = await this.api.getFieldState();
      this.items.set(payload.items.map((item) => ({ ...item, sync: 'synced' as const })));
      this.evidence.set(payload.evidence.map((record) => ({ ...record, sync: 'synced' as const })));
      this.findings.set(payload.findings.map((finding) => ({ ...finding, sync: 'synced' as const })));
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
    this.findings.set(saved.findings);
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
