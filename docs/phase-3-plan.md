# Phase 3 Plan

Phase 3 builds the AI copilot layer. AI assists auditors by drafting, suggesting, and retrieving. It does not decide audit outcomes.

## Scope

- Tenant- and auditee-isolated EMS knowledge base.
- RAG retrieval with citations.
- EMS document Q&A.
- Finding drafting from evidence.
- Clause mapping suggestions.
- Severity assist.
- Line-of-inquiry prompts.
- Transition gap candidates.
- Photo-identification result review.

## Server Boundary

Live AI calls belong in Cloud Functions or Cloud Run with Firebase Genkit. The client sends an intent and scoped record ids. Server code resolves tenant claims, retrieves only tenant/auditee content, calls the model provider, writes reviewable outputs, and logs provenance.

## Isolation Rules

- Every retrieval request includes `tenantId`, `auditeeId`, and `requestedBy`.
- Every citation must match the same tenant and auditee.
- Vector namespaces use `tenantId:auditeeId` keys.
- AI outputs store provider, model, prompt hash, citations, source evidence, and review status.
- Cross-tenant retrieval is a must-fail test.

## Audit Integrity

AI outputs start as `needsAuditorReview`. Auditors may accept, edit, reject, or supersede the suggestion. No AI output becomes an issued finding, severity, report section, or transition gap without auditor confirmation.

## Acceptance Criteria

- EMS documents can be represented as embedded knowledge-base records.
- RAG results reject citations from another tenant or auditee.
- Finding drafts include evidence refs, clause suggestions, severity suggestions, citations, and review status.
- Photo-analysis outputs remain review-only.
- Dashboard shows the AI review queue.

## Next Step

Phase 4 should turn confirmed findings into reports and CAPA workflows, including PDF generation and lead-auditor signoff.
