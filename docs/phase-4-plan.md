# Phase 4 Plan

Phase 4 turns fieldwork into signed audit reports and corrective-action tracking.

## Scope

- Draft audit report generation from confirmed audit records.
- PDF report artifact references in tenant/audit-scoped Storage.
- Lead-auditor signoff.
- CAPA tracking with owners, due dates, verification, and evidence refs.
- Reminder schedule for corrective-action follow-up.
- Transition gap report summary for ISO 14001:2015 to ISO 14001:2026.

## Server Boundary

PDF generation, report signing, reminder sending, and CAPA notification jobs should run in Cloud Functions or Cloud Run. Client code may request those operations, but server code must verify custom claims and audit assignment before writing privileged records.

## Audit Integrity

- A report cannot be signed without `signedBy`, `signedAt`, and `pdfStorageRef`.
- CAPA records must remain linked to findings.
- Verification evidence should be attached before closing a CAPA.
- Transition gap summaries are included only after lead-auditor review.

## Acceptance Criteria

- Draft report contracts include sections, findings, CAPA refs, transition gap refs, and version.
- Signoff converts a report to signed status with durable attribution.
- CAPA records include owner, action, due date, verification, status, and reminders.
- Reminder schedules are server-actionable.
- Report and CAPA records remain tenant and audit scoped.

## Next Step

Phase 5 should harden the product for pilot use: security emulator tests, offline edge cases, accessibility, observability, CI, deployment, and a pilot-readiness checklist.
