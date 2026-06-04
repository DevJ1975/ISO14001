-- Enterprise auth (TOTP MFA, SSO/OIDC, SCIM) — additive, default-off.
-- Mirrors the Mongo reference backend (server/collections.ts + routes.ts).
-- Apply with the Supabase CLI / MCP. All columns/tables are additive: existing
-- email/password login is unaffected when nothing here is configured.

-- TOTP MFA + SCIM external identity live on the existing members row.
alter table if exists public.members
  add column if not exists mfa jsonb not null default '{"enabled": false}'::jsonb,
  add column if not exists external_id text,
  add column if not exists provisioned_via text;

-- A member is matched by externalId per tenant for SCIM deprovision.
create index if not exists members_tenant_external_id_idx
  on public.members (tenant_id, external_id);

-- Tenant SSO (OIDC) config. NO client secret is stored here; the secret for the
-- (gated) token exchange is read from a function secret, never from this table.
create table if not exists public.sso_configs (
  tenant_id text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

-- Tenant SCIM provisioning tokens. Only the SHA-256 hash is stored; the raw
-- token is shown to the admin once at issue time.
create table if not exists public.provisioning_tokens (
  id text primary key,
  tenant_id text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by_uid text,
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists provisioning_tokens_tenant_idx
  on public.provisioning_tokens (tenant_id) where revoked_at is null;
