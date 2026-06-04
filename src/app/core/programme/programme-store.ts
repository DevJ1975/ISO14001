import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  type Certificate,
  type CertificateStatus,
  type ComplaintAppeal,
  type ComplaintKind,
  type InternalAudit,
  transitionCertificate,
} from '../domain';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { idbGet, idbSet } from '../field/idb';

export type AuditTypeKind =
  | 'internal'
  | 'certificationStage1'
  | 'certificationStage2'
  | 'surveillance'
  | 'recertification'
  | 'special';
export type PlannedStatus = 'planned' | 'inProgress' | 'completed' | 'cancelled';

export interface PlannedAudit {
  id: string;
  type: AuditTypeKind;
  dueDate: string;
  status: PlannedStatus;
  /** Justified planned audit-days for this certification audit (IAF MD 5). */
  plannedDays?: number;
  /** Audit-days actually spent, reconciled against the plan. */
  actualDays?: number;
}

export interface CompetenceRecord {
  id: string;
  memberName: string;
  qualifications: string;
  impartialityDeclared: boolean;
}

/** Inputs for the audit-time (IAF MD 5) and √N sampling (IAF MD 1) calculators. */
export interface PlanningInputs {
  effectivePersonnel?: number;
  complexity?: 'high' | 'medium' | 'low' | 'limited';
  siteCount?: number;
  stage?: 'initial' | 'surveillance' | 'recertification';
}

export interface Programme {
  tenantId: string;
  cycleYear: number;
  criteria: string;
  plannedAudits: PlannedAudit[];
  /** Auditee's own internal-audit schedule (ISO 45001 cl. 9.2). */
  internalAudits: InternalAudit[];
  competence: CompetenceRecord[];
  certificates: Certificate[];
  complaintsAppeals: ComplaintAppeal[];
  planning: PlanningInputs;
  updatedAt: string;
}

const KEY = 'programme';
let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** Backfill arrays/objects added after a programme was first stored. */
function normalize(programme: Programme | null): Programme | null {
  if (!programme) return null;
  return {
    ...programme,
    plannedAudits: programme.plannedAudits ?? [],
    internalAudits: programme.internalAudits ?? [],
    competence: programme.competence ?? [],
    certificates: programme.certificates ?? [],
    complaintsAppeals: programme.complaintsAppeals ?? [],
    planning: programme.planning ?? {},
  };
}

/** Tenant-scoped audit programme (surveillance/recert schedule + competence). Whole-document sync. */
@Injectable({ providedIn: 'root' })
export class ProgrammeStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly config = inject(APP_CONFIG);

  readonly programme = signal<Programme | null>(null);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly source = signal<'local' | 'live'>('local');

  constructor() {
    if (typeof window !== 'undefined') {
      void this.bootstrap();
    }
  }

  async reload(): Promise<void> {
    await this.bootstrap();
  }

  ensure(): Programme {
    const existing = this.programme();
    if (existing) return existing;
    const created: Programme = {
      tenantId: this.tenantId(),
      cycleYear: new Date().getFullYear(),
      criteria: 'ISO_45001_2018',
      plannedAudits: [],
      internalAudits: [],
      competence: [],
      certificates: [],
      complaintsAppeals: [],
      planning: {},
      updatedAt: new Date().toISOString(),
    };
    this.programme.set(created);
    this.save();
    return created;
  }

  setCycleYear(year: number): void {
    const programme = this.ensure();
    this.programme.set({ ...programme, cycleYear: year });
    this.save();
  }

  addPlannedAudit(type: AuditTypeKind, dueDate: string): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      plannedAudits: [...programme.plannedAudits, { id: uid('plan'), type, dueDate, status: 'planned' }],
    });
    this.save();
  }

  updatePlannedAudit(id: string, patch: Partial<PlannedAudit>): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      plannedAudits: programme.plannedAudits.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
    this.save();
  }

  removePlannedAudit(id: string): void {
    const programme = this.ensure();
    this.programme.set({ ...programme, plannedAudits: programme.plannedAudits.filter((entry) => entry.id !== id) });
    this.save();
  }

  // --- Internal-audit programme (ISO 45001 cl. 9.2) ---

  addInternalAudit(scopeArea = '', plannedDate = new Date().toISOString().slice(0, 10)): void {
    const programme = this.ensure();
    const entry: InternalAudit = { id: uid('ia'), scopeArea, plannedDate, status: 'planned' };
    this.programme.set({ ...programme, internalAudits: [...programme.internalAudits, entry] });
    this.save();
  }

  updateInternalAudit(id: string, patch: Partial<InternalAudit>): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      internalAudits: programme.internalAudits.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
    this.save();
  }

  removeInternalAudit(id: string): void {
    const programme = this.ensure();
    this.programme.set({ ...programme, internalAudits: programme.internalAudits.filter((entry) => entry.id !== id) });
    this.save();
  }

  addCompetence(memberName: string): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      competence: [...programme.competence, { id: uid('comp'), memberName, qualifications: '', impartialityDeclared: false }],
    });
    this.save();
  }

  updateCompetence(id: string, patch: Partial<CompetenceRecord>): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      competence: programme.competence.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
    this.save();
  }

  // --- Certificates (ISO/IEC 17021-1 cl. 9.5–9.6) ---

  addCertificate(): void {
    const programme = this.ensure();
    const now = new Date().toISOString();
    const certificate: Certificate = {
      id: uid('cert'),
      certificateNumber: '',
      edition: 'ISO_45001_2026',
      scopeStatement: '',
      sites: [],
      status: 'active',
      history: [{ action: 'issued', at: now }],
      updatedAt: now,
    };
    this.programme.set({ ...programme, certificates: [...programme.certificates, certificate] });
    this.save();
  }

  updateCertificate(id: string, patch: Partial<Certificate>): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      certificates: programme.certificates.map((entry) =>
        entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry,
      ),
    });
    this.save();
  }

  /** Apply a lifecycle transition; no-op if the transition is illegal. */
  transitionCertificate(id: string, to: CertificateStatus, reason?: string): void {
    const programme = this.ensure();
    const by = this.auth.user()?.displayName ?? 'Lead auditor';
    const at = new Date().toISOString();
    this.programme.set({
      ...programme,
      certificates: programme.certificates.map((entry) => {
        if (entry.id !== id) return entry;
        try {
          return transitionCertificate(entry, to, by, at, reason);
        } catch {
          return entry;
        }
      }),
    });
    this.save();
  }

  removeCertificate(id: string): void {
    const programme = this.ensure();
    this.programme.set({ ...programme, certificates: programme.certificates.filter((entry) => entry.id !== id) });
    this.save();
  }

  // --- Complaints & appeals (ISO/IEC 17021-1 cl. 9.7–9.8) ---

  addComplaint(kind: ComplaintKind): void {
    const programme = this.ensure();
    const now = new Date().toISOString();
    const item: ComplaintAppeal = {
      id: uid('case'),
      kind,
      subject: '',
      description: '',
      receivedAt: now.slice(0, 10),
      status: 'received',
      updatedAt: now,
    };
    this.programme.set({ ...programme, complaintsAppeals: [...programme.complaintsAppeals, item] });
    this.save();
  }

  updateComplaint(id: string, patch: Partial<ComplaintAppeal>): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      complaintsAppeals: programme.complaintsAppeals.map((entry) =>
        entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry,
      ),
    });
    this.save();
  }

  removeComplaint(id: string): void {
    const programme = this.ensure();
    this.programme.set({
      ...programme,
      complaintsAppeals: programme.complaintsAppeals.filter((entry) => entry.id !== id),
    });
    this.save();
  }

  // --- Planning aids (IAF MD 5 audit time / MD 1 sampling) ---

  setPlanning(patch: Partial<PlanningInputs>): void {
    const programme = this.ensure();
    this.programme.set({ ...programme, planning: { ...programme.planning, ...patch } });
    this.save();
  }

  private save(): void {
    const programme = this.programme();
    if (!programme) return;
    const next = { ...programme, updatedAt: new Date().toISOString() };
    this.programme.set(next);
    void idbSet('meta', KEY, next);
    if (this.source() === 'live' && this.online()) {
      void firstValueFrom(this.http.put(`${this.base()}/programme`, next)).catch(() => undefined);
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      const programme = await firstValueFrom(this.http.get<Programme | null>(`${this.base()}/programme`));
      this.programme.set(normalize(programme ?? null));
      this.source.set('live');
      this.online.set(true);
    } catch {
      this.source.set('local');
      const saved = await idbGet<Programme>('meta', KEY);
      if (saved) this.programme.set(normalize(saved));
    }
  }

  private tenantId(): string {
    return this.auth.user()?.tenantId ?? this.config.tenantId;
  }

  private base(): string {
    return `${this.config.apiBaseUrl}/tenants/${this.tenantId()}`;
  }
}
