# Data Model

MongoDB collections use tenant-scoped document keys and indexed fields. The logical hierarchy remains:

```txt
/platform/config
/platform/superadmins/{uid}
/platform/standards/{edition}
```

Tenant data:

```txt
/tenants/{tenantId}
  /members/{uid}
  /invites/{inviteId}
  /auditees/{auditeeId}
  /checklistTemplates/{templateId}
  /audits/{auditId}
    /checklistItems/{itemId}
    /findings/{findingId}
    /evidence/{evidenceId}
    /photoAnalyses/{analysisId}
    /capa/{capaId}
    /report/{reportId}
  /emsKnowledgeBase/{auditeeId}/docs/{docId}
  /ai/conversations/{uid}/messages/{messageId}
  /changeLog/{changeId}
```

## Indexing

`server/collections.ts` creates indexes for audit status, assigned members, evidence creator/time, upload-intent idempotency, AI photo-analysis review queues, report versions, reminder schedules, and backend jobs. Add query-specific indexes with the feature that introduces each query.

## Photo Evidence

Photo upload intents use tenant-scoped storage keys under:

```txt
/tenants/{tenantId}/audits/{auditId}/evidence/photos/{fileName}
```

The MongoDB evidence document stores the storage reference, image hash, capture source, offline local id when applicable, timestamp, GPS, and `createdBy`. AI image-identification output is written to `photoAnalyses` by server-side code and remains a suggestion until reviewed by an auditor.

## Phase 1 Planning Records

Auditees store client organizations, sites, contacts, and active/archive status. Checklist templates store tenant-authored or licensed prompts mapped to shared clause identifiers. Audits reference an auditee, criteria edition, template, assigned members, lead auditor, and section owners.

## Phase 2 Field Execution Records

Checklist execution rows live under each audit. Evidence and findings stay separate so offline field capture does not create large conflicting audit documents. Local sync queue items are client-local until a write succeeds or needs manual conflict review. Durable server-side audit history belongs in `/changeLog`.

## Phase 3 AI Copilot Records

EMS knowledge-base documents are scoped by tenant and auditee. AI conversations and generated outputs store model, prompt hash, citations, source evidence, and review status. Citations must never reference another tenant or auditee.

## Phase 4 Report and CAPA Records

Report records reference generated PDF artifacts in tenant/audit-scoped storage keys. CAPA records link back to findings and carry owner, due date, verification, and status. Reminder schedules are server-actionable records used by Node workers.

## Phase 6 Backend Jobs

`backendJobs` records track upload intents, AI photo-analysis requests, report PDF generation, member-claim assignment, and CAPA reminders. Each job carries tenant context, requester, idempotency key, retry count, status, and result reference.
