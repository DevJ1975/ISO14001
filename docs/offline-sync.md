# Offline Sync Strategy

The field app must work while auditors are offline at remote or industrial sites.

## Selected Strategy

Use a client-side local queue with:

- Logical checklist section ownership assigned by the lead auditor.
- Last-write-wins per document when concurrent edits still occur.
- Server-written change-log records for create, update, delete, AI confirmation, and report signing events.

## Why This Default

Section ownership prevents most collisions without making field capture slow. Last-write-wins keeps the client simple for low-risk checklist edits, while the API writes a change log to preserve auditability when a later write overwrites a field.

## Rules for Data Shape

- Evidence and findings are separate documents, not large arrays on the audit document.
- Every field-captured record includes `tenantId`, `auditId`, `createdBy`, and timestamps.
- Photo evidence keeps an `offlineLocalId` until the image upload completes and the server confirms the storage reference.
- Destructive deletes are disabled for audit records in v1; use status changes instead.
- AI-generated text stays draft metadata until confirmed by an auditor.
- AI photo-identification output is review-only; it may suggest labels, environmental signals, clause references, and finding drafts, but it cannot create an issued finding without auditor action.

## Field Execution Queue

Field writes are queued locally with operation, collection path, document id, queued user, timestamp, retry count, and status. The queue must stay visible during fieldwork so auditors know whether evidence is safely synced before closing out an audit day.

## Conflict Review

When two assigned auditors edit the same checklist item, the app records affected fields and both editor ids. Section ownership should prevent most collisions, but any remaining conflict is surfaced for manual review before report signoff.
