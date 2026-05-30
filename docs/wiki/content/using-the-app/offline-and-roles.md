---
id: offline-and-roles
title: Offline Use, Sync & Roles
category: using-the-app
order: 6
icon: cloud_sync
type: doc
version: 1.0.0
summary: How offline-first sync works and what each role can do.
---

## Offline-first by design

Everything you capture is written to the device first, so dead zones never lose data.

1. Mutations are saved locally and added to a **sync outbox**.
2. The header shows the **pending count** and the data-source pill (Live / Local / Offline).
3. On reconnect, queued records sync automatically; tap the pill to sync now.
4. Records move through **queued → syncing → synced**; conflicts are surfaced for review.

### Field readiness checklist

- Open each assigned audit while online so the checklist and context are cached.
- Capture one test note or photo if tenant policy allows.
- Confirm the outbox clears after reconnecting.
- Install the app to the Home Screen for full-screen, offline-capable use.

## Roles & permissions

| Role | Can do |
| --- | --- |
| **Auditor** | Answer clauses, capture evidence, raise findings, draft corrective actions. |
| **Lead auditor** | All auditor actions, plus grade nonconformities, verify effectiveness, record conclusions and sign the report. |
| **Tenant admin** | Manage members, auditees, sites, templates and tenant configuration. |
| **Client viewer** | Read-only access to scoped follow-up records. |

Permissions are enforced **on the server**. Lead-only and admin-only controls are hidden for other roles, and users cannot query outside their tenant.

## Data protection

- Never share screenshots or exported reports outside approved channels.
- Do not store customer secrets in notes.
- Do not download evidence to unmanaged devices.
- Report suspected cross-tenant access immediately.
