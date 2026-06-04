import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import type { AdminMemberView, AdminTenantView } from '../domain';

export interface ProvisionedMember extends AdminMemberView {
  setPasswordLink?: string;
}

export interface ProvisionUserInput {
  email: string;
  displayName: string;
  role?: 'leadAuditor' | 'auditor' | 'clientViewer' | 'tenantAdmin';
}

export interface ProvisionClientInput {
  tenantName: string;
  plan: 'pilot' | 'team' | 'enterprise';
  leadAuditor: { email: string; displayName: string };
  clientUsers: ProvisionUserInput[];
}

/**
 * Cross-tenant client for the platform-superadmin console. Unlike FieldApiService
 * these calls are NOT tenant-scoped (the superadmin has no tenantId); the bearer
 * token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  private base(): string {
    return `${this.config.apiBaseUrl}/admin`;
  }

  provisionClient(input: ProvisionClientInput): Promise<{ tenantId: string; members: ProvisionedMember[] }> {
    return firstValueFrom(
      this.http.post<{ tenantId: string; members: ProvisionedMember[] }>(`${this.base()}/tenants`, {
        ...input,
        idempotencyKey: cryptoRandomKey(),
      }),
    );
  }

  async listTenants(): Promise<AdminTenantView[]> {
    const result = await firstValueFrom(this.http.get<{ tenants: AdminTenantView[] }>(`${this.base()}/tenants`));
    return result?.tenants ?? [];
  }

  async listMembers(tenantId: string): Promise<AdminMemberView[]> {
    const result = await firstValueFrom(
      this.http.get<{ members: AdminMemberView[] }>(`${this.base()}/tenants/${encodeURIComponent(tenantId)}/members`),
    );
    return result?.members ?? [];
  }

  addMember(tenantId: string, body: ProvisionUserInput): Promise<{ member: AdminMemberView; setPasswordLink?: string }> {
    return firstValueFrom(
      this.http.post<{ member: AdminMemberView; setPasswordLink?: string }>(
        `${this.base()}/tenants/${encodeURIComponent(tenantId)}/members`,
        body,
      ),
    );
  }

  resendLink(tenantId: string, uid: string): Promise<{ ok: boolean; setPasswordLink?: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; setPasswordLink?: string }>(
        `${this.base()}/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}/resend`,
        {},
      ),
    );
  }

  revokeLink(tenantId: string, uid: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${this.base()}/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}/revoke`, {}),
    );
  }

  setMemberStatus(tenantId: string, uid: string, status: 'active' | 'disabled'): Promise<unknown> {
    return firstValueFrom(
      this.http.put(`${this.base()}/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}`, { status }),
    );
  }
}

function cryptoRandomKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `prov-${crypto.randomUUID()}`;
  }
  return `prov-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
