# Soteria Signum — ISO 45001 Audit Platform

**Soteria Signum** (by Trainovate) is a production-grade, multi-tenant
occupational health & safety (ISO 45001:2018) audit PWA — the field tool an
auditor uses to run OH&S management-system audits. Each tenant is a client site
the auditor is working on; audits are conducted against ISO 45001:2018 (or the
2026 edition placeholder), covering hazard identification & risk, worker
consultation, legal & other requirements, incidents & investigation, and the
full clause 4–10 register set.

## Stack

- Angular 21 standalone components (signals, OnPush), offline-first PWA
- Angular Material
- **Live backend: a Supabase Edge Function** (`supabase/functions/api`) over
  Postgres JSONB document tables (`members`, `field_records`, `programmes`),
  with custom HS256 app-JWT auth and PBKDF2 passwords (Web Crypto)
- Tenant- and audit-scoped records; lead-only actions enforced server-side
- Camera/photo evidence capture (on-device today; Storage upload planned)
- TypeScript and zod domain contracts

> The original Node API under `server/` (MongoDB) is the reference
> implementation and is covered by the test suite, but it is **not** the
> deployed backend. Production runs on the Supabase edge function, which
> mirrors the same HTTP contract. Keep the two in sync when changing routes.

## Local Development

```bash
npm install
npm run start
npm run api
```

## Verification

```bash
npm run lint        # ESLint (angular-eslint + typescript-eslint)
npm run typecheck
npm test
npm run build
```

### Browser E2E (opt-in)

Playwright specs in `e2e/` drive the real app (against the offline demo store, so
no backend is needed) and include an axe accessibility scan. They are **not** in
the gating CI because they need browser binaries:

```bash
npx playwright install chromium
npm run e2e
```

## Live backend (Supabase)

Production points at the Supabase edge function via `APP_CONFIG.apiBaseUrl`
(the project URL and anon key are public; the service-role key stays
server-side in the function). The function source lives in
`supabase/functions/api/index.ts`.

Demo sign-in: `ava.brooks@example-audit.test` / `audit-demo-2026`. The header
data-source pill shows **Live** once signed in, **Local** before sign-in or
when the backend is unreachable (the workspace still runs on the on-device
store), and **Offline** with no connectivity.

**Hardening for real use (enforced in code):**

- Set an `APP_JWT_SECRET` secret on the Supabase function. There is **no**
  fallback to the service-role key — the function returns an auth error until a
  dedicated secret is configured, so tokens can't be forged with a shared key.
- Set `APP_ALLOWED_ORIGINS` (comma-separated) to the app domain(s). CORS now
  reflects only allow-listed origins and never emits a wildcard.
- The deployed function validates every write (findings, CAPA, registers) the
  same way the Node reference backend does, so malformed/oversized/unknown-field
  payloads are rejected (400) rather than persisted.
- Rotate any database password shared during setup.

### Reference Node/MongoDB backend (not deployed)

```bash
cp .env.example .env
npm run mongo:init    # prints the demo email + password
npm run api
```

This mirrors the same HTTP contract for local development and is what the
test suite exercises. Do not expose `MONGODB_URI`/`JWT_SECRET` to Angular or
commit credentials. The `ALLOW_DEV_AUTH_HEADERS` path is local-only and must
stay disabled in production.

## Standards Guardrail

ISO standards are copyrighted. This repo stores only clause identifiers and short titles. Checklist content must be customer-authored or properly licensed before public release.

## AI report drafting

The Report screen's **Generate draft** action auto-writes the audit conclusions
(overall conformity, OH&S effectiveness opinion, criteria-met statement and a
recommendation) from the audit's own results. By default it uses an **offline,
rule-based composer** — deterministic, no key, no network — so it works in the
field. When the backend is configured with `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`
(server-side secrets only), the `/report-draft` endpoint upgrades the same button
to a Claude-generated draft, and the client falls back to the rule-based composer
on any error. The lead auditor reviews and edits every field before signing —
generated text is a draft, never the final record — and the prompt forbids
verbatim ISO requirement text.

## Docs

- [Phase 0 Plan](docs/phase-0-plan.md)
- [Phase 1 Plan](docs/phase-1-plan.md)
- [Phase 2 Plan](docs/phase-2-plan.md)
- [Phase 3 Plan](docs/phase-3-plan.md)
- [Phase 4 Plan](docs/phase-4-plan.md)
- [Phase 5 Plan](docs/phase-5-plan.md)
- [Phase 6 Plan](docs/phase-6-plan.md)
- [MongoDB Backend](docs/mongodb-backend.md)
- [Tenancy and RBAC](docs/tenancy-rbac.md)
- [Offline Sync Strategy](docs/offline-sync.md)
- [Data Model](docs/data-model.md)
- [Auditor Wiki](docs/wiki/README.md)
  - [Auditor Implementation Manual](docs/wiki/auditor-implementation-manual.md)
  - [Auditor Training Manual](docs/wiki/auditor-training-manual.md)
