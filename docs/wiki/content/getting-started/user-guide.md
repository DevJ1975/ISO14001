---
id: user-guide
title: Comprehensive User Guide
category: getting-started
order: 1
icon: menu_book
type: doc
version: 1.0.0
summary: The complete end-to-end guide to running an ISO 14001 audit in Trainovate, from sign-in to a signed report.
---

## What Trainovate is

Trainovate is a field-ready ISO 14001 environmental audit workspace for lead auditors and audit teams. It guides an audit from on-site fieldwork through nonconformities, corrective action, audit conclusions and the signed report — and it keeps working when you lose signal.

It is grounded in **ISO 19011:2018** (auditing management systems), **ISO/IEC 17021-1** (requirements for certification bodies) and **ISO 14001:2015** (environmental management systems). This guide is your reference for each part of the workflow.

> This guide is Trainovate-authored operating guidance. It refers to ISO clauses by identifier and short title only and does not reproduce ISO requirements text.

## Signing in: Live, Local and Offline

Sign in with your auditor credentials to load the live audit from the backend. The **data-source pill** in the header shows where your data currently lives:

- **Live** — connected to the backend; your changes are saved to the server.
- **Local** — running on the on-device store (the backend is not reachable or not configured); changes are kept on the device.
- **Offline** — no connectivity; changes are queued and sync automatically when you reconnect.

If the backend is not configured you can still choose **Continue in offline demo mode** to explore the full workflow on local seed data.

## The workspace at a glance

Navigate with the side rail (landscape / desktop) or the bottom tab bar (portrait / touch):

| Tab | What you do there |
| --- | --- |
| Overview | See the audit snapshot, status and key metrics. |
| Audit | Manage the audit lifecycle, opening and closing meetings. |
| Fieldwork | Answer the checklist one clause at a time. |
| Evidence | Capture photos and notes as objective evidence. |
| Findings | Grade nonconformities and drive corrective action. |
| EMS | Maintain the ISO 14001 environmental registers. |
| Report | Record conclusions, the recommendation and sign-off. |
| Programme | Plan audits across the certification cycle. |
| Wiki | This knowledge base, FAQs and document templates. |

The header also shows a live clock, local weather, the connectivity / sync indicator and a light / dark theme toggle.

## The audit workflow, step by step

A typical audit moves through these stages. Each maps to a tab.

1. **Plan** — confirm scope, objectives, criteria edition, sites, dates and the audit team (Programme + Audit tabs).
2. **Open** — hold the opening meeting and record it (Audit tab).
3. **Fieldwork** — work the checklist clause by clause, recording results and capturing evidence (Fieldwork + Evidence tabs).
4. **Findings** — raise and grade nonconformities; open corrective actions (Findings tab).
5. **Evaluate the EMS** — complete the aspects, compliance and emergency registers (EMS tab).
6. **Close** — hold the closing meeting, agree timelines and record conclusions (Audit + Report tabs).
7. **Report & sign off** — confirm readiness checks and sign the report (Report tab).
8. **Follow up** — verify corrective-action effectiveness and close nonconformities (Findings tab).

## Fieldwork — answering clauses

Fieldwork presents **one clause at a time** so you can work one-handed while walking the site.

1. Read the clause question and guidance.
2. Record a result: **Conform**, **Minor NC**, **Major NC**, **OFI** or **N/A**.
3. Add a field note and capture photo evidence as needed.
4. Use **Log finding** on a non-conforming clause to raise a nonconformity.
5. Use **Next** (or swipe) to move through the checklist; the progress bar tracks completion.

## Evidence — objective evidence

Audit findings must be based on objective evidence. Capture it as you go:

- **Photos** — taken with the device camera; timestamp and author are attached automatically, and GPS when available.
- **Notes** — interview responses, observations and sample references.
- Each item shows a **sync badge** (queued / syncing / synced) so nothing is lost.

Good evidence is *relevant*, *attributable*, *timestamped* and *linked* to a checklist item, finding, interview note or corrective-action record.

## Findings & nonconformity grading

A **nonconformity** is the non-fulfilment of a requirement. Record it against a specific clause with a clear statement and the objective evidence it is based on, then grade it:

- **Major NC** — affects the EMS's capability to achieve intended results: absence or total breakdown of a required process, significant doubt about control or conformance, legal / environmental risk, or several minors against one requirement (systemic). A major NC blocks certification.
- **Minor NC** — an isolated lapse that does not undermine the EMS overall.
- **OFI** — an opportunity for improvement; not a nonconformity.

Only the **lead auditor** can set the grade and rationale. Open a finding to edit its statement, objective evidence and grading.

## Corrective action & effectiveness

Each nonconformity drives a corrective-action record (ISO 14001 cl. 10.2):

1. **Correction** — the immediate containment action.
2. **Root cause** — why the nonconformity occurred.
3. **Corrective action** — what eliminates the cause so it cannot recur, with an owner and due date.
4. Mark **implemented** once evidence of implementation exists.
5. The **lead auditor verifies effectiveness**; an effective action closes the nonconformity.

Verification of effectiveness is lead-only and requires connectivity. Typical timelines: major NCs ~30 days, minor NCs ~90 days.

## Audit lifecycle, meetings & conclusions

The audit moves through a lifecycle (planned → fieldwork → reporting → follow-up → closed). Record the opening and closing meetings, then capture the audit conclusions:

- **Opening meeting** — confirm scope, criteria, methods, confidentiality and schedule with the auditee.
- **Closing meeting** — present findings, agree timelines and record the auditee's acknowledgement.
- **Conclusions** — overall conformity, EMS effectiveness opinion, the degree to which criteria were met, and the recommendation (recommend / conditional / not recommended for certification; or satisfactory / action required for internal audits).

## EMS registers

EMS-specific evaluation is captured in dedicated registers on the **EMS** tab:

- **Significant environmental aspects** (cl. 6.1.2 / 8.1) — aspect, activity, impact, lifecycle stage, significance and controls.
- **Compliance obligations & evaluation of compliance** (cl. 9.1.2) — obligation, source, requirement and compliance status.
- **Emergency preparedness & response** (cl. 8.2) — scenarios, procedures and drills.

## Report & sign-off

The audit report follows ISO 19011 6.5.7: objectives, scope, criteria, team and participants, dates, findings and evidence, conclusions, the degree criteria were met, and any diverging opinions.

The Report screen shows **readiness checks** (clauses answered, nonconformities closed, evidence captured, changes synced). When ready, the lead auditor signs off with an attestation and the signed report is recorded on the server.

## Audit programme

The Programme tab manages audits across the certification cycle: initial (stage 1 / 2), surveillance (typically annual) and recertification (before the three-year cycle ends), plus finding trends and auditor competence / impartiality records.

## Working offline

Everything you capture is saved on the device first, so dead zones never lose data.

- Mutations are queued; the header shows the pending count.
- When you reconnect, queued records sync automatically (or tap the data-source pill to sync now).
- Add the app to your iPad Home Screen to run it full-screen as an installed app.

## Roles & permissions

- **Auditor** — answer clauses, capture evidence, raise findings, draft corrective actions.
- **Lead auditor** — additionally grades nonconformities, verifies effectiveness, records conclusions and signs the report.
- **Tenant admin** — manages members, auditees, templates and tenant configuration.
- **Client viewer** — read-only access to scoped follow-up records.

Permissions are enforced on the server; lead-only and admin-only controls are hidden for other roles.

## Where to go next

- New to the app? Start with the [Quick Start](quick-start).
- Need a record or template? See the [Records & Documents Register](records-and-documents-register).
- Have a question? Check the [App FAQs](faqs-app) and [ISO 14001 FAQs](faqs-iso14001).
