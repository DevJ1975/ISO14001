# Trainovate ISO 14001 Audit Platform

Clean Phase 0 foundation for a production-grade, multi-tenant environmental-audit PWA.

## Stack

- Angular 21 standalone components
- Angular Material
- Firebase Hosting, Auth, Firestore, Storage, App Check-ready rules
- Connected Firebase web backend for project `auditor-ece22`
- Camera/photo evidence capture with AI image-identification contracts
- TypeScript and zod domain contracts
- Firebase Genkit planned for tenant-isolated AI workflows

## Local Development

```bash
npm install
npm run start
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Firebase

```bash
npm run firebase:emulators
```

The Firebase web app config is in `src/app/core/firebase/firebase.config.ts`. Firebase client config is public by design; protect data with Auth, App Check, Firestore rules, Storage rules, and server-side custom claims. Do not commit service-account files, Admin SDK credentials, private keys, function secrets, or customer data.

## Standards Guardrail

ISO standards are copyrighted. This repo stores only clause identifiers and short titles. Checklist content must be customer-authored or properly licensed before public release.

## Docs

- [Phase 0 Plan](docs/phase-0-plan.md)
- [Phase 1 Plan](docs/phase-1-plan.md)
- [Phase 2 Plan](docs/phase-2-plan.md)
- [Phase 3 Plan](docs/phase-3-plan.md)
- [Phase 4 Plan](docs/phase-4-plan.md)
- [Phase 5 Plan](docs/phase-5-plan.md)
- [Tenancy and RBAC](docs/tenancy-rbac.md)
- [Offline Sync Strategy](docs/offline-sync.md)
- [Data Model](docs/data-model.md)
- [Auditor Wiki](docs/wiki/README.md)
  - [Auditor Implementation Manual](docs/wiki/auditor-implementation-manual.md)
  - [Auditor Training Manual](docs/wiki/auditor-training-manual.md)
