# Auditor Implementation Manual

## Purpose

This manual helps a tenant audit firm implement the Trainovate ISO 14001 audit platform for real audit work. It focuses on setup, governance, data quality, and field readiness.

## Implementation Principles

- Keep each audit firm in its own tenant.
- Assign the least privileged role that supports the user's work.
- Capture evidence at the source whenever possible.
- Treat AI output as a suggestion that requires auditor review.
- Preserve attribution for every record.
- Avoid storing ISO copyrighted requirement text unless Trainovate has confirmed licensing.

## Tenant Setup

1. Create the tenant record with legal firm name, status, plan, and branding colors.
2. Add the tenant admin through the server-side provisioning flow.
3. Confirm the tenant admin receives server-verified claims with the correct `tenantId` and `role`.
4. Configure tenant branding and default report appearance.
5. Add auditee organizations, sites, and primary contacts.

## Member Setup

1. Tenant Admin invites members by email.
2. The invite acceptance endpoint links or provisions the authenticated user.
3. The server sets tenant role claims.
4. The member signs in and confirms their active tenant.
5. Deactivated members lose access but remain attached to historical records.

## Role Defaults

- Tenant Admin: member management, auditee setup, templates, tenant configuration.
- Lead Auditor: audit planning, team assignment, report signoff.
- Auditor: field evidence, notes, and findings on assigned audits.
- Client Viewer: read-only access to scoped auditee follow-up records.

## Audit Setup

1. Create an audit with auditee, site, scope, objectives, criteria edition, dates, and lead auditor.
2. Assign the audit team before fieldwork begins.
3. Assign checklist section ownership to reduce offline edit collisions.
4. Select or create a tenant checklist template.
5. Confirm the team has offline access before arriving on site.

## Checklist Configuration

Use the shared ISO 14001 framework for clause identifiers and short titles. Add tenant-authored questions, guidance, and required-evidence prompts. Keep each prompt specific enough for consistent field use.

## Photo Evidence Implementation

1. Enable camera capture in the PWA on auditor devices.
2. Request a tenant/audit upload intent from the MongoDB API.
3. Write a matching evidence record with image hash, timestamp, GPS when available, and `createdBy`.
4. Preserve an `offlineLocalId` until upload is confirmed.
5. Route a server-side copy to AI image identification only after the evidence document is created.

## AI Photo Identification

AI may suggest:

- Visible objects or conditions.
- Environmental signal categories.
- Visible text found in the image.
- Clause candidates using identifiers and titles.
- Draft finding candidates.

AI must not:

- Issue findings automatically.
- Change severity without auditor confirmation.
- Access photos from another tenant or auditee.
- Replace auditor judgment.

## Offline Field Readiness

Before fieldwork:

1. Open each assigned audit while online.
2. Confirm checklist items and auditee context are cached.
3. Capture one test note or photo if allowed by tenant policy.
4. Confirm the sync queue clears after reconnecting.
5. Resolve duplicate section ownership before the opening meeting.

## Evidence Quality Standard

Good evidence is relevant, attributable, timestamped, and linked to a checklist item, finding, interview note, or CAPA record. Photo evidence should include context in the note field when the image alone could be ambiguous.

## Security Checks

- Confirm users cannot query outside their tenant.
- Confirm unassigned auditors cannot open the audit.
- Confirm Storage paths include tenant and audit identifiers.
- Confirm App Check is enabled before production release.
- Confirm service accounts and API secrets are not committed.

## Go-Live Checklist

- Tenant created and active.
- Members invited and roles confirmed.
- Auditees and sites loaded.
- Checklist template approved by lead auditor.
- Offline test completed on target devices.
- Photo capture tested.
- AI suggestion review workflow understood.
- Report signoff owner confirmed.
