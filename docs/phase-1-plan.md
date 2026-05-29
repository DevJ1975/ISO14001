# Phase 1 Plan

Phase 1 builds the planning layer: auditees, checklist templates, and audit setup with assigned teams.

## Scope

- Auditee management with sites and contacts.
- Tenant checklist templates layered on the shared ISO 14001 clause framework.
- Audit setup with scope, objectives, criteria edition, lead auditor, assigned members, dates, and section ownership.
- Checklist item generation for audit fieldwork.

## Data Boundaries

All Phase 1 records live under `/tenants/{tenantId}`. Shared standards content remains under `/platform/standards/{edition}` and contains only clause identifiers and short titles.

## Checklist Guardrail

Checklist questions and guidance must be customer-authored, Trainovate-generated, or licensed. Do not copy ISO requirements text into tenant templates.

## Acceptance Criteria

- Tenant admins and lead auditors can create auditees.
- Tenant admins can publish checklist templates.
- Lead auditors can create audits from active templates.
- The lead auditor is included in the assigned team.
- Section owners are assigned audit members.
- Generated audit checklist items keep tenant, audit, owner, and clause attribution.

## Next Step

Wire the Phase 1 forms to Firestore once Phase 0 custom-claims provisioning and emulator rules tests are complete.
