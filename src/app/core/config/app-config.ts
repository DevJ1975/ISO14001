import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Backend API root — the Supabase Edge Function that hosts the audit API. */
  apiBaseUrl: string;
  /** Supabase publishable anon key (public) — routes requests through the gateway. */
  supabaseAnonKey: string;
  /** Fallback tenant used in URLs before sign-in; the real tenant comes from the token. */
  tenantId: string;
  auditId: string;
  /** Pre-filled demo credentials for the sign-in screen (only when configured). */
  demo: { email: string; password: string };
}

const TENANT_ID = 'tenant-greenline';

// Deployment-time overrides: a self-hosted/white-label deployment can set
// `window.__APP_CONFIG__` (e.g. from an env-substituted snippet in index.html)
// to point at its own Supabase project and suppress demo credentials, without
// rebuilding. The committed defaults below keep the public demo working.
interface RuntimeConfig {
  apiBaseUrl?: string;
  supabaseAnonKey?: string;
  tenantId?: string;
  auditId?: string;
  demo?: { email: string; password: string } | null;
}

function runtimeConfig(): RuntimeConfig {
  if (typeof globalThis === 'undefined') return {};
  return ((globalThis as unknown as { __APP_CONFIG__?: RuntimeConfig }).__APP_CONFIG__) ?? {};
}

const DEFAULT_DEMO = { email: 'ava.brooks@example-audit.test', password: 'audit-demo-2026' };

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => {
    const rc = runtimeConfig();
    return {
      // Live backend: the audit API runs as a Supabase Edge Function (custom auth).
      // The project URL and anon key are public by design; override per deployment
      // via window.__APP_CONFIG__ rather than editing source.
      apiBaseUrl: rc.apiBaseUrl ?? 'https://kwgbxexrjozppbcidmut.supabase.co/functions/v1/api',
      supabaseAnonKey:
        rc.supabaseAnonKey ??
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2J4ZXhyam96cHBiY2lkbXV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMTYxNTUsImV4cCI6MjA5NTY5MjE1NX0.eCvqgI-njR5CbOkZEOuVpi1djZA8BYgwVZeUQsLEUfo',
      tenantId: rc.tenantId ?? TENANT_ID,
      auditId: rc.auditId ?? 'audit-transition-1',
      // `demo: null` (set by a deployment) disables the prefilled demo creds.
      demo: rc.demo === null ? { email: '', password: '' } : rc.demo ?? DEFAULT_DEMO,
    };
  },
});
