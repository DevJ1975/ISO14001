import { InjectionToken } from '@angular/core';

export interface FieldActor {
  uid: string;
  role: string;
  tenantId: string;
  platform: boolean;
}

export interface AppConfig {
  /** Same-origin API root. The browser talks to the Node/Mongo API here. */
  apiBaseUrl: string;
  tenantId: string;
  auditId: string;
  actor: FieldActor;
  /**
   * Send dev auth headers (x-iso-*). The backend honours these only when it
   * runs with ALLOW_DEV_AUTH_HEADERS enabled. This is a prototype path until
   * real bearer-token verification is implemented server-side.
   */
  sendDevAuthHeaders: boolean;
}

const TENANT_ID = 'tenant-greenline';

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    apiBaseUrl: '/api',
    tenantId: TENANT_ID,
    auditId: 'audit-transition-1',
    actor: { uid: 'uid-ava-auditor', role: 'auditor', tenantId: TENANT_ID, platform: false },
    sendDevAuthHeaders: true,
  }),
});
