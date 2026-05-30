import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Same-origin API root. The browser talks to the Node/Mongo API here. */
  apiBaseUrl: string;
  /** Fallback tenant used in URLs before sign-in; the real tenant comes from the token. */
  tenantId: string;
  auditId: string;
  /** Pre-filled demo credentials for the sign-in screen (seeded by `npm run mongo:init`). */
  demo: { email: string; password: string };
}

const TENANT_ID = 'tenant-greenline';

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    // Live backend: the audit API runs as a Supabase Edge Function (custom auth),
    // so no Vercel env vars are required. The Supabase project URL is public.
    apiBaseUrl: 'https://kwgbxexrjozppbcidmut.supabase.co/functions/v1/api',
    tenantId: TENANT_ID,
    auditId: 'audit-transition-1',
    demo: { email: 'ava.brooks@example-audit.test', password: 'audit-demo-2026' },
  }),
});
