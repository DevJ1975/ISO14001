import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import type { FieldChecklistItem, FieldEvidence, FieldFinding, FieldResult } from './field-audit-store';

export interface FieldStatePayload {
  items: Array<Omit<FieldChecklistItem, 'sync'>>;
  evidence: Array<Omit<FieldEvidence, 'sync' | 'thumbUrl'>>;
  findings: Array<Omit<FieldFinding, 'sync'>>;
}

/** Thin client over the tenant-scoped field-audit endpoints. The bearer token is
 *  attached by the auth interceptor; the tenant comes from the signed-in user. */
@Injectable({ providedIn: 'root' })
export class FieldApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
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
    return firstValueFrom(this.http.get<FieldStatePayload>(`${this.base()}/field-state`));
  }

  putChecklistResult(itemId: string, body: { result: FieldResult; note?: string }): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.base()}/checklist/${encodeURIComponent(itemId)}`, body));
  }

  createEvidence(body: Omit<FieldEvidence, 'sync' | 'thumbUrl' | 'blobKey'>): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/evidence`, body));
  }

  createFinding(body: Omit<FieldFinding, 'sync' | 'status'>): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/findings`, body));
  }

  confirmFinding(id: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base()}/findings/${encodeURIComponent(id)}/confirm`, {}));
  }

  private base(): string {
    const tenantId = this.auth.user()?.tenantId ?? this.config.tenantId;
    return `${this.config.apiBaseUrl}/tenants/${tenantId}/audits/${this.config.auditId}`;
  }
}
