# Phase 2 Plan

Phase 2 builds field execution: offline checklist work, evidence capture, findings, and multi-auditor sync visibility.

## Scope

- Audit checklist execution rows generated from tenant templates.
- Evidence capture for notes, interviews, documents, and photos.
- Findings register with draft status, clause mapping, severity, and linked evidence.
- Offline sync queue for local writes.
- Conflict detection for concurrent checklist edits.

## Field Capture Invariants

- Every field record includes `tenantId`, `auditId`, `createdBy`, and a timestamp.
- Evidence and findings are separate documents.
- Photo uploads use tenant/audit Storage paths.
- Draft findings do not become issued findings until auditor confirmation.
- AI suggestions remain draft/review artifacts until accepted by an auditor.

## Multi-Auditor Behavior

The lead auditor assigns checklist section owners before fieldwork. Auditors can capture records for assigned sections. If concurrent edits occur, the app applies last-write-wins at the document level and records conflict details for manual review where needed.

## Offline Sync

Local writes enter a sync queue with operation, collection path, document id, queued user, and retry count. Failed or conflicting writes remain visible so an auditor can resolve them before report signoff.

## Acceptance Criteria

- Assigned auditors can capture evidence offline.
- Evidence links back to checklist items and clauses.
- Draft findings link to evidence.
- Sync queue shows pending local writes.
- Conflicts identify local and remote editors plus affected fields.
- Unassigned users cannot capture audit records.

## Next Step

Phase 3 should connect Genkit flows for tenant-isolated RAG, finding drafting, clause suggestion, severity assist, and AI photo-identification processing.
