import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import type { FieldChecklistItem, FieldEvidence, FieldFinding, FieldResult } from './field-audit-store';

export interface FieldStatePayload {
  items: Array<Omit<FieldChecklistItem, 'sync'>>;
  evidence: Array<Omit<FieldEvidence, 'sync' | 'thumbUrl'>>;
  findings: Array<Omit<FieldFinding, 'sync'>>;
}

/** Thin client over the tenant-scoped field-audit endpoints on the Node/Mongo API. */
@Injectable({ providedIn: 'root' })
export class FieldApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  async health(): Promise<boolean> {
    try {
      const result = await firstValueFrom(this.http.get<{ ok: boolean }>(`${this.config.apiBaseUrl}/health`));
      return result?.ok === true;
    } catch {
      return false;
    }
  }

  getFieldState(): Promise<FieldStatePayload> {
    return firstValueFrom(this.http.get<FieldStatePayload>(`${this.base()}/field-state`, { headers: this.headers() }));
  }

  putChecklistResult(itemId: string, body: { result: FieldResult; note?: string }): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/checklist/${encodeURIComponent(itemId)}`, body, { headers: this.headers() }));
  }

  createEvidence(body: Omit<FieldEvidence, 'sync' | 'thumbUrl' | 'blobKey'>): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/evidence`, body, { headers: this.headers() }));
  }

  createFinding(body: Omit<FieldFinding, 'sync' | 'status'>): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/findings`, body, { headers: this.headers() }));
  }

  confirmFinding(id: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/findings/${encodeURIComponent(id)}/confirm`, {}, { headers: this.headers() }));
  }

  private base(): string {
    return `${this.config.apiBaseUrl}/tenants/${this.config.tenantId}/audits/${this.config.auditId}`;
  }

  private headers(): Record<string, string> {
    if (!this.config.sendDevAuthHeaders) {
      return {};
    }
    const actor = this.config.actor;
    return {
      'x-iso-actor-uid': actor.uid,
      'x-iso-tenant-id': actor.tenantId,
      'x-iso-role': actor.role,
      'x-iso-platform': String(actor.platform),
    };
  }
}
