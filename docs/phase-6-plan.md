# Phase 6 Plan: MongoDB Backend Activation

## Goal

Switch production persistence from Firebase to a server-owned MongoDB backend. Angular sends intents to a Node API; the API validates tenant, role, audit assignment, idempotency, and file metadata before writing MongoDB records.

## Scope

- Node API server under `server/`.
- MongoDB driver connection with bounded pooling.
- Tenant-scoped collections and indexes.
- Tenant onboarding, member invites, claim assignment commands.
- Photo evidence upload intents.
- AI photo-analysis job records.
- Report PDF generation job records.
- CAPA reminder job records.

## Trust Boundary

The browser never receives `MONGODB_URI` and never connects to MongoDB directly. The API must verify a production bearer token before accepting writes. Local development can opt into explicit `ALLOW_DEV_AUTH_HEADERS=true`, but this is disabled by default.

## Remaining Production Work

- Select and wire the production JWT provider.
- Add audit-assignment lookup checks before evidence and AI jobs.
- Add GridFS or object-storage byte upload workers.
- Add worker processes for photo AI, report PDF generation, and reminder delivery.
- Add integration tests against a local MongoDB service or Testcontainers.
