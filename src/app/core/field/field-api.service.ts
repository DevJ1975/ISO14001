import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { AuditSelectionService } from './audit-selection.service';
import type {
  AuditConclusion,
  AuditMeeting,
  AuditStatus,
  AuditSummary,
  ComplianceObligation,
  EmergencyRecord,
  EnvironmentalAspect,
  FieldCapa,
  FieldChecklistItem,
  FieldEvidence,
  FieldFinding,
  FieldResult,
} from './field-audit-store';

export interface FieldStatePayload {
  audit?: AuditSummary | null;
  items: Array<Omit<FieldChecklistItem, 'sync'>>;
  evidence: Array<Omit<FieldEvidence, 'sync' | 'thumbUrl'>>;
  findings: Array<Omit<FieldFinding, 'sync'>>;
  capas?: Array<Omit<FieldCapa, 'sync'>>;
  auditStatus?: AuditStatus;
  meetings?: Array<Omit<AuditMeeting, 'sync'>>;
  conclusion?: Omit<AuditConclusion, 'sync'> | null;
  aspects?: Array<Omit<EnvironmentalAspect, 'sync'>>;
  obligations?: Array<Omit<ComplianceObligation, 'sync'>>;
  emergencyRecords?: Array<Omit<EmergencyRecord, 'sync'>>;
}

/** Thin client over the tenant-scoped field-audit endpoints. The bearer token is
 *  attached by the auth interceptor; the tenant comes from the signed-in user. */
@Injectable({ providedIn: 'root' })
export class FieldApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly config = inject(APP_CONFIG);
  private readonly selection = inject(AuditSelectionService);

  async listAudits(): Promise<AuditSummary[]> {
    const result = await firstValueFrom(this.http.get<{ audits: AuditSummary[] }>(`${this.tenantBase()}/audits`));
    return result?.audits ?? [];
  }

  createAudit(body: { auditee: string; scope: string; criteria: string }): Promise<AuditSummary> {
    return firstValueFrom(
      this.http.post<{ audit: AuditSummary }>(`${this.tenantBase()}/audits`, body),
    ).then((r) => r.audit);
  }

  async health(): Promise<boolean> {
    try {
      const result = await firstValueFrom(this.http.get<{ ok: boolean }>(`${this.config.apiBaseUrl}/health`));
      return result?.ok === true;
    } catch {
      return false;
    }
  }

  getFieldState(): Promise<FieldStatePayload> {
    return firstValueFrom(this.http.get<FieldStatePayload>(`${this.base()}/field-state`));
  }

  putChecklistResult(itemId: string, body: { result: FieldResult; note?: string }): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/checklist/${encodeURIComponent(itemId)}`, body));
  }

  createEvidence(body: Omit<FieldEvidence, 'sync' | 'thumbUrl' | 'blobKey'>): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/evidence`, body));
  }

  upsertFinding(body: Omit<FieldFinding, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/findings/${encodeURIComponent(body.id)}`, body));
  }

  upsertCapa(body: Omit<FieldCapa, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/capa/${encodeURIComponent(body.id)}`, body));
  }

  verifyCapa(
    id: string,
    body: { findingId: string; verification: string; effective: boolean; verificationEvidenceIds: string[] },
  ): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/capa/${encodeURIComponent(id)}/verify`, body));
  }

  setAuditStatus(status: AuditStatus): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/status`, { status }));
  }

  upsertMeeting(body: Omit<AuditMeeting, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/meetings/${encodeURIComponent(body.id)}`, body));
  }

  saveConclusion(body: Omit<AuditConclusion, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/conclusion`, body));
  }

  signReport(body: { attestation: string }): Promise<{ signedAt?: string }> {
    return firstValueFrom(this.http.post<{ signedAt?: string }>(`${this.base()}/reports/signoff`, body));
  }

  upsertAspect(body: Omit<EnvironmentalAspect, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/aspects/${encodeURIComponent(body.id)}`, body));
  }

  upsertObligation(body: Omit<ComplianceObligation, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/obligations/${encodeURIComponent(body.id)}`, body));
  }

  upsertEmergency(body: Omit<EmergencyRecord, 'sync'>): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/emergency/${encodeURIComponent(body.id)}`, body));
  }

  private tenantBase(): string {
    const tenantId = this.auth.user()?.tenantId ?? this.config.tenantId;
    return `${this.config.apiBaseUrl}/tenants/${tenantId}`;
  }

  private base(): string {
    return `${this.tenantBase()}/audits/${this.selection.selectedAuditId()}`;
  }
}
