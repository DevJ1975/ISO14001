import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Backend API root — the Supabase Edge Function that hosts the audit API. */
  apiBaseUrl: string;
  /** Supabase publishable anon key (public) — routes requests through the gateway. */
  supabaseAnonKey: string;
  /** Fallback tenant used in URLs before sign-in; the real tenant comes from the token. */
  tenantId: string;
  auditId: string;
  /** Pre-filled demo credentials for the sign-in screen. */
  demo: { email: string; password: string };
}

const TENANT_ID = 'tenant-greenline';

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    // Live backend: the audit API runs as a Supabase Edge Function (custom auth),
    // so no Vercel env vars are required. The project URL and anon key are public.
    apiBaseUrl: 'https://kwgbxexrjozppbcidmut.supabase.co/functions/v1/api',
    supabaseAnonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z2J4ZXhyam96cHBiY2lkbXV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMTYxNTUsImV4cCI6MjA5NTY5MjE1NX0.eCvqgI-njR5CbOkZEOuVpi1djZA8BYgwVZeUQsLEUfo',
    tenantId: TENANT_ID,
    auditId: 'audit-transition-1',
    demo: { email: 'ava.brooks@example-audit.test', password: 'audit-demo-2026' },
  }),
});
