# MongoDB Backend

## Architecture

Angular talks to the Node API at `/api`. The API is the only component that uses `MONGODB_URI`. MongoDB stores tenants, members, audits, evidence metadata, upload intents, AI analysis records, reports, CAPA reminders, observability events, and backend jobs.

## Local Commands

```bash
cp .env.example .env
npm run mongo:init
npm run api
```

`npm run mongo:init` creates the collection indexes defined in `server/collections.ts`.

## Collections

- `tenants`
- `members`
- `invites`
- `audits`
- `evidence`
- `evidenceUploadIntents`
- `photoAnalyses`
- `reports`
- `capaReminders`
- `backendJobs`
- `observabilityEvents`

## API Boundary

The Phase 6 API accepts intent-style commands:

- `POST /api/tenants`
- `POST /api/tenants/:tenantId/invites`
- `POST /api/tenants/:tenantId/members/:uid/claims`
- `POST /api/tenants/:tenantId/audits/:auditId/evidence/upload-intents`
- `POST /api/tenants/:tenantId/audits/:auditId/photo-analysis-jobs`
- `POST /api/tenants/:tenantId/audits/:auditId/reports/:reportId/pdf-jobs`
- `POST /api/tenants/:tenantId/audits/:auditId/capa/:capaId/reminders`

## Security Notes

Production must provide a real JWT verifier before deployment. Development headers are intentionally behind `ALLOW_DEV_AUTH_HEADERS=true` so local testing cannot be mistaken for production authentication.
