-- Superadmin console + client portal parity with the Node reference backend.
-- Additive: existing tenant/member/audit data is unaffected. Apply with the
-- Supabase CLI / MCP.

-- Tenant directory for the platform-superadmin console. Each row's doc holds
-- { id, name, plan, status, createdAt }. idempotency_key dedupes a retried
-- "onboard client" so a double-submit never creates a duplicate tenant.
create table if not exists public.tenants (
  id text primary key,
  idempotency_key text unique,
  doc jsonb not null,
  created_at timestamptz not null default now()
);

-- Single-use, expiring "set your password" tokens. Only the SHA-256 hash is
-- stored; the raw token travels solely in the emailed link. tenant_id is the
-- sentinel 'platform' for the tenant-less superadmin.
create table if not exists public.set_password_tokens (
  id text primary key,
  token_hash text not null unique,
  uid text not null,
  tenant_id text,
  email text not null,
  purpose text not null default 'invite',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists set_password_tokens_uid_purpose_idx
  on public.set_password_tokens (uid, purpose) where consumed_at is null;
