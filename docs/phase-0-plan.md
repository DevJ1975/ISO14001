# Phase 0 Plan

Phase 0 establishes the platform boundaries that later audit workflows must respect.

## Decisions Locked for V1

- Application-level multi-tenancy using Firebase Auth custom claims: `{ role, tenantId }`.
- Platform superadmin actions run server-side only.
- Offline conflict handling uses section ownership to reduce collisions, then last-write-wins per document with an immutable change log.
- Firebase Hosting is the default hosting target.
- Angular Material is the UI foundation, wrapped by Trainovate design-system components as the product grows.

## Deliverables

- Angular standalone PWA shell.
- Shared TypeScript and zod domain contracts.
- Firebase rules baseline for tenant isolation.
- Storage path convention for tenant/audit evidence and reports.
- Camera/photo evidence contracts and server-written AI image analysis records.
- Clause seed for ISO 14001:2015 and ISO 14001:2026 using identifiers and short titles only.
- Initial tests for domain invariants.

## Next Vertical Slice

Build invite acceptance and member provisioning through Cloud Functions so claims are set only server-side.
