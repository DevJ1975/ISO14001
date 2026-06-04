# Soteria Signum — User Manual

**Soteria Signum** (by Trainovate) is a multi-tenant ISO 45001:2018
occupational health & safety (OH&S) audit platform. It is the field tool an
auditor uses to plan, run, evidence, report and follow up a management-system
audit — and the portal an audited organisation uses to supply evidence and
respond to findings.

This manual explains how to use the product, end to end, for every kind of
user. It is the **living, canonical user guide** and is meant to be updated
whenever a feature is added or changed (see
[Keeping this manual up to date](#keeping-this-manual-up-to-date)).

> This is original Trainovate guidance. It references ISO clauses by **number
> and short title only** and does not reproduce copyrighted standard text. Keep
> that boundary when you edit these pages.

---

## Who this is for

The platform has two primary personas plus an administration layer. Each has
its own guide:

| Guide | For | What it covers |
|-------|-----|----------------|
| **[Getting started](getting-started.md)** | Everyone | Core concepts, signing in, the workspace layout, the Live/Local/Offline indicator, offline & sync, notifications, your password. **Read this first.** |
| **[Auditor guide](auditor-guide.md)** | Auditors & Lead Auditors | The full audit workflow: planning, fieldwork, evidence, findings & corrective action, the 25 registers, reporting & sign-off, the audit programme, analytics, retention and the help tools. |
| **[Auditee guide](auditee-guide.md)** | Client / audited organisation (the "Client portal") | Uploading requested evidence, messaging the auditor, and acknowledging & responding to findings. |
| **[Administrator guide](administrator-guide.md)** | Tenant Admins & Platform Superadmins | Onboarding client tenants, inviting members, assigning roles, resetting passwords and deactivating access. |

---

## The product at a glance

- **Multi-tenant.** Each audit firm (or client workspace) is an isolated
  *tenant*. Users, audits and evidence never cross tenant boundaries.
- **Audit-centric.** One **active audit** drives every screen. You pick it on
  the **Audits** screen; everything else (fieldwork, findings, registers,
  report) reflects that audit.
- **Offline-first PWA.** You can keep working with no connectivity. Changes
  queue on the device and sync when you reconnect. A status pill always shows
  whether you are **Live**, **Local** or **Offline**.
- **Role-scoped.** Auditors get the full workspace; clients (auditees) are
  confined to the **Client portal**; platform superadmins use a separate
  provisioning console.
- **AI-assisted, human-decided.** Several screens can generate a *draft*
  (agendas, finding statements, report conclusions, photo observations,
  checklist emphasis). Every draft is reviewed and edited by a person before it
  becomes a record. When no AI backend is configured the same buttons fall back
  to an offline, rule-based composer.

---

## Module map (feature inventory)

Every destination in the left-hand navigation, what it is for, and the guide
section that covers it. Auditees only ever see **Client portal**.

| Module | Icon term | Purpose | Covered in |
|--------|-----------|---------|------------|
| Overview | dashboard | At-a-glance KPIs, progress and "needs attention" for the active audit | Auditor §1 |
| Analytics | insights | Cross-audit portfolio health, trends and programme progress | Auditor §12 |
| Actions | notifications | Unified, prioritised "what needs my attention" list | Auditor §14 |
| Audits | folder_open | List, create and select the active audit | Auditor §2 |
| Audit | event | Status lifecycle, opening/closing meetings, AI agenda & scripts | Auditor §3 |
| Fieldwork | checklist | The clause-by-clause checklist: decisions, notes, photos, tailoring | Auditor §4 |
| Evidence | photo_camera | Capture photos & notes; AI photo analysis with a review gate | Auditor §5 |
| Findings | flag | Findings, grading and the corrective-action (CAPA) loop | Auditor §6 |
| Registers | health_and_safety | 25 OH&S registers aligned to ISO 45001 cl. 4–10 | Auditor §7 |
| People & Sites | groups | Master lists of workers and sites for reuse across registers | Auditor §8 |
| Report | description | Conclusions, sign-off, integrity, working papers, PDF | Auditor §10 |
| Programme | calendar_month | Certification cycle, internal audits, time & site sampling, certificates | Auditor §11 |
| Requests | cloud_upload | Request evidence from the client and review their uploads | Auditor §9 |
| Client portal | handshake | The auditee's workspace (uploads, messaging, finding responses) | Auditee guide |
| Retention | inventory_2 | Records-retention & legal-hold policy view | Auditor §13 |
| Users | group | Invite teammates, set roles, reset passwords, deactivate | Administrator guide |

Top-bar tools available from anywhere: **command palette (⌘K / Ctrl-K)**,
**guided tour**, **Auditor's field guide**, **Auditor's manual**, **Auditor
copilot**, **notifications**, **light/dark theme** and **sign out**. These are
described in [Getting started](getting-started.md).

---

## Keeping this manual up to date

This manual is part of the product and ships in the repository under
`docs/user-manual/`. Treat it like code: **when you change behaviour a user can
see, update the manual in the same change.**

Practical rules:

1. **New navigation destination?** Add a row to the
   [Module map](#module-map-feature-inventory) above and a new numbered section
   in the relevant guide (usually `auditor-guide.md`). Mirror the convention of
   the existing sections: *Purpose → What you see → Actions & fields →
   Step-by-step → Role notes*.
2. **New field, button, status or option on an existing screen?** Update that
   screen's section. Quote the **exact on-screen label** so the manual matches
   what users read.
3. **New role, permission or sign-in path?** Update the roles table in
   [Getting started](getting-started.md) and the
   [Administrator guide](administrator-guide.md).
4. **Auditee-visible change** (evidence requests, finding responses, portal
   KPIs)? Update the [Auditee guide](auditee-guide.md).
5. **Record it.** Add a dated line to the [Change log](#change-log) below.
6. **Respect the standards guardrail.** Reference ISO clauses by number and
   short title only; never paste copyrighted requirement text.

Authoritative sources when you are unsure what a screen does:

- Navigation: `src/app/core/shell/nav.ts`
- Roles & sign-in: `src/app/core/auth/`
- A screen's behaviour: `src/app/features/<name>/`

> Tip: this manual was assembled by reading the feature components directly. If
> you maintain it the same way — describe what the component actually renders —
> it will stay trustworthy.

---

## Change log

Keep this list newest-first. One line per user-visible change.

- _2026-06-04_ — Initial complete user manual: Getting started, Auditor,
  Auditee and Administrator guides covering the full ISO 45001 workspace,
  the Client portal, the 25 registers, reporting/sign-off and onboarding.

---

## Related documentation

- Product overview & developer setup: [`../../README.md`](../../README.md)
- Auditor wiki (firm-implementation & training guidance):
  [`../wiki/README.md`](../wiki/README.md)
- Tenancy & roles design: [`../tenancy-rbac.md`](../tenancy-rbac.md)
- Offline & sync design: [`../offline-sync.md`](../offline-sync.md)
- Data model: [`../data-model.md`](../data-model.md)
