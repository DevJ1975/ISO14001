# Trainovate ISO 14001 Audit Platform

Clean Phase 0-6 foundation for a production-grade, multi-tenant environmental-audit PWA.

## Stack

- Angular 21 standalone components
- Angular Material
- Node API backend with MongoDB as the system of record
- Tenant-scoped MongoDB collections, indexes, upload intents, and backend job queues
- Camera/photo evidence capture with AI image-identification contracts
- TypeScript and zod domain contracts
- Server-side AI and PDF workers planned behind MongoDB job records

## Local Development

```bash
npm install
npm run start
npm run api
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## MongoDB Backend

```bash
cp .env.example .env
npm run mongo:init
npm run api
```

MongoDB is accessed only from the Node API under `server/`. Do not expose `MONGODB_URI` to Angular or commit database credentials, JWT signing keys, API keys, private keys, or customer data.

## Standards Guardrail

ISO standards are copyrighted. This repo stores only clause identifiers and short titles. Checklist content must be customer-authored or properly licensed before public release.

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
