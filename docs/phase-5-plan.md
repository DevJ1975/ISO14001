# Phase 5 Plan

Phase 5 hardens the platform for a friendly-firm pilot audit.

## Scope

- Tenant isolation API probes.
- MongoDB API guard and storage-key hardening.
- Offline sync edge-case testing.
- Accessibility review for core auditor flows.
- Observability for audit-critical events.
- CI and deployment readiness.
- Pilot checklist and rollback plan.

## Soteria Theme

The Soteria theme is the product's safety and assurance visual layer. It uses guardian teal, deep blue, bronze accents, restrained surfaces, and shield iconography to communicate protection without making the operational UI decorative or heavy.

## Pilot Exit Criteria

- Cross-tenant access probes fail as expected.
- Assigned and unassigned audit access probes pass.
- Two auditors complete an offline fieldwork rehearsal.
- Photo evidence upload and AI review workflow are tested.
- Core flows pass WCAG 2.1 AA review.
- Report signoff and CAPA reminder paths are rehearsed.
- Observability events are visible for report signoff, sync conflicts, evidence failures, AI review, and CAPA reminder failures.
- Support and rollback paths are documented before the pilot.

## Production Guardrails

- Never let client code perform platform superadmin operations directly.
- Never issue findings, CAPA closure, or report signoff from AI output alone.
- Never deploy without auth verification, API guard tests, MongoDB index setup, and CI passing.
- Never delete audit evidence; archive or supersede records instead.
