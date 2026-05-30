# Phase 0 Plan

Phase 0 establishes the platform boundaries that later audit workflows must respect.

## Decisions Locked for V1

- Application-level multi-tenancy using server-verified JWT claims: `{ role, tenantId }`.
- Platform superadmin actions run server-side only.
- Offline conflict handling uses section ownership to reduce collisions, then last-write-wins per document with an immutable change log.
- Static hosting remains replaceable; production data access goes through the Node API.
- Angular Material is the UI foundation, wrapped by Trainovate design-system components as the product grows.

## Deliverables

- Angular standalone PWA shell.
- Shared TypeScript and zod domain contracts.
- MongoDB API guard baseline for tenant isolation.
- Tenant/audit storage key convention for evidence and reports.
- Camera/photo evidence contracts and server-written AI image analysis records.
- Clause seed for ISO 14001:2015 and ISO 14001:2026 using identifiers and short titles only.
- Initial tests for domain invariants.

## Next Vertical Slice

Build invite acceptance and member provisioning through the Node API so tenant roles are set only server-side.
