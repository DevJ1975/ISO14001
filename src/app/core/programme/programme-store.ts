import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
}

export interface CompetenceRecord {
  id: string;
  memberName: string;
  qualifications: string;
  impartialityDeclared: boolean;
}

export interface Programme {
  tenantId: string;
  cycleYear: number;
  criteria: string;
  plannedAudits: PlannedAudit[];
  competence: CompetenceRecord[];
  updatedAt: string;
}

const KEY = 'programme';
let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
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
      criteria: 'ISO_14001_2026',
      plannedAudits: [],
      competence: [],
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
      this.programme.set(programme ?? null);
      this.source.set('live');
      this.online.set(true);
    } catch {
      this.source.set('local');
      const saved = await idbGet<Programme>('meta', KEY);
      if (saved) this.programme.set(saved);
    }
  }

  private tenantId(): string {
    return this.auth.user()?.tenantId ?? this.config.tenantId;
  }

  private base(): string {
    return `${this.config.apiBaseUrl}/tenants/${this.tenantId()}`;
  }
}
