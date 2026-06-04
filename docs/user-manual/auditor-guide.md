# Auditor guide

This guide walks an **Auditor** or **Lead Auditor** through the whole platform,
screen by screen, in the order a real audit tends to flow. If you haven't yet,
read [Getting started](getting-started.md) for sign-in, navigation and the
offline model.

Actions that **only a Lead Auditor** (or, where noted, a Tenant Admin) can
perform are marked **🔒 Lead**. Throughout, AI-generated text is a *draft you
must review and edit* before it becomes a record.

### The audit lifecycle (how the screens fit together)

1. **Pick the audit** → [Audits](#2-audits--choose-or-create-the-active-audit)
2. **Plan** → [Audit](#3-audit--status-meetings--agenda) (status, agenda,
   opening meeting), [Programme](#11-programme--the-certification-cycle)
3. **Do the fieldwork** → [Fieldwork](#4-fieldwork--the-checklist),
   [Evidence](#5-evidence--photos-notes--ai-analysis),
   [Registers](#7-registers--the-25-ohs-registers),
   [People & Sites](#8-people--sites), [Requests](#9-requests--evidence-from-the-client)
4. **Conclude** → [Findings & CAPA](#6-findings--corrective-action),
   [Report](#10-report--conclusions-sign-off--integrity)
5. **Follow up & oversee** → [Actions](#14-actions--alerts),
   [Analytics](#12-analytics), [Retention](#13-retention)
6. **Get help anytime** → [Copilot, Field guide & Manual](#15-help-tools-copilot-field-guide--manual)

Use the **Overview** screen ([§1](#1-overview--the-audit-dashboard)) as your
home base between steps.

---

## 1. Overview — the audit dashboard

**Purpose:** a real-time snapshot of the active audit's health.

**What you see:**

- A header naming the **client site under audit**, the **criteria** and the
  current **status** (e.g. *fieldwork*, *closed*).
- A **fieldwork progress** bar ("X / Y clauses · Z%").
- A row of **KPI cards** — Open NCs, Major, Minor, OFIs, CAPA overdue, Open
  incidents, High-risk hazards, RIDDOR, Consultations, Evidence. Critical
  counts turn red. Click a card to drill into the related screen.
- Charts and panels: **Nonconformities by clause**, **Corrective actions**
  (Verified / In progress / Overdue), **Hazards by risk band**, **Evaluation of
  compliance**, **OH&S performance** (actual vs target with trend), and a
  **hazard risk heat-map** (5×5 likelihood × severity).
- **Needs attention** — the top alerts, each linking to its detail; an "X
  items →" link opens the full [Actions](#14-actions--alerts) list.

**How to use it:** scan the progress bar and KPIs, click any card or alert to
jump to the work, then come back to re-check status.

---

## 2. Audits — choose or create the active audit

**Purpose:** list every audit and select the one you'll work on. *"The active
audit drives every other screen."*

**What you see:** tiles for each audit showing the auditee, criteria, scope and
a **status badge** (draft, fieldwork, reporting, followUp, closed). The
selected audit is ticked.

**Select an audit:** click its tile — the app sets it active and takes you to
the Overview.

**Create an audit** (🔒 Lead Auditor or Tenant Admin):

1. Click **New audit**.
2. Fill in **Auditee / organization** (required), **Scope** (optional) and
   **Criteria** (*ISO 45001:2018* or *ISO 45001:2026*).
3. Click **Create & open**. The new audit becomes active.

> If you're not signed in Live as a lead auditor, creation is blocked with an
> explanatory message.

---

## 3. Audit — status, meetings & agenda

**Purpose:** the audit-level cockpit — move the audit through its lifecycle,
generate meeting materials, and record the opening and closing meetings.

**Status lifecycle.** A five-step stepper shows **Planned → Fieldwork →
Reporting → Follow-up → Closed**. The **Lead Auditor** (🔒) advances it with the
buttons (e.g. **→ Fieldwork**, **→ Reporting**).

**Agenda & meeting scripts** 🔒 Lead:

- **Generate agenda** drafts a tailored opening-meeting agenda from this
  audit's own data (objectives, an itinerary by clause with durations, and
  sampling notes).
- **Generate meeting scripts** drafts opening- and closing-meeting talking
  points.
- Both are AI-assisted when a backend is configured, otherwise rule-based.
  Review and adapt before the meeting — the note reminds you it's a draft.

**Record the opening meeting** (and, later, the **closing meeting**):

1. Expand **Record meeting** (or **Edit record**).
2. Enter **Attendees** (one per line), **Agenda points** (one per line) and
   **Notes**.
3. Tick **Auditee acknowledged** if they confirmed understanding.
4. Click **Save meeting**. Saved meetings show their timestamp, attendees,
   agenda and an "Acknowledged" badge.

---

## 4. Fieldwork — the checklist

**Purpose:** step through the ISO 45001 clauses, record a decision on each,
and attach notes and photos. This is where most of the audit happens.

**What you see:** a progress bar ("X / Y clauses answered") and one **clause
card** at a time showing the clause number, section, position ("3 of 18"), the
question and any guidance.

**Answer a clause:**

1. Read the question and guidance; conduct your interview / observation /
   document review.
2. Type into **Field note** (observations, interview responses, sample
   references). If your device supports it, tap the **mic** to dictate the note.
3. Optionally attach a **Photo** from the evidence strip (it links to this
   clause).
4. Record a decision with the buttons (or keys **1–5**): **Conform**,
   **Minor NC**, **Major NC**, **OFI**, **N/A**. A toast confirms it.
5. Move on with **Next** / **Prev** (or **← / →**).

**If you marked Minor NC, Major NC or OFI**, a **Log finding from this clause**
button appears — it creates a finding and takes you to
[Findings](#6-findings--corrective-action).

**Filters & tailoring:**

- Filter chips: **All**, **Unanswered**, **Non-conformities**.
- **Edit wording** lets you reword a question/guidance for this client (use your
  own wording — no standard text); **Remove** deletes a check.
- **Add a check** inserts a custom question: pick the **Clause**, write the
  **Question** and optional **Guidance**, then **Add check**.
- **Tailor to client** generates priority areas, focus prompts and risk-based
  notes from the client's sector, size, hazards and prior findings — guidance,
  not a substitute for your judgement.
- If only part of the standard is loaded, an **Add N clauses** button loads the
  rest.

When every clause has a decision, a banner offers **Go to report**.

---

## 5. Evidence — photos, notes & AI analysis

**Purpose:** the central store for all photos and notes. Items are held on the
device and queued for tenant-scoped upload.

**Capture:**

- **Capture photo** opens the device camera; the photo appears in the grid as
  **On this device only** until it becomes **Stored in the cloud**.
- Type a note and click **Add note**.
- Photos taken from a Fieldwork clause are tagged **Clause X**; location is
  tagged when available.

**AI photo analysis (review-gated).** For a photo, click **Analyze with AI**.
When it returns, you may see an **AI suggestion — review required** card with:

- **Observations** (e.g. visible conditions),
- **Hazard tags**, and
- a **Suggested finding** (clause, type and statement).

Nothing is applied until you decide:

- **Accept** promotes the suggestion to a finding (which you then edit in
  [Findings](#6-findings--corrective-action)).
- **Reject** discards it.

AI analysis needs the server/key; offline it stays disabled (you'll see a note
to that effect). Don't rely on AI for unclear, cropped or out-of-scope photos.

---

## 6. Findings & corrective action

**Purpose:** grade each finding against its clause with objective evidence, then
drive the corrective-action (CAPA) loop to close-out.

**What you see:** a stat grid (**Major NC**, **Minor NC**, **OFI**, **Open
NCs**, **Overdue CAPA**) and an accordion of findings. Each finding shows its
type, clause and status (open, closed, verified, rejected, reopened).

**Work a finding** (expand it):

1. Optionally **Draft this finding** — auto-writes the requirement summary,
   statement and a suggested grade from the finding's data; review and edit
   every field.
2. Edit the **Nonconformity statement** and **Objective evidence** (records,
   observations, interviews). Changes autosave ("Finding updated").
3. 🔒 Lead **Grade** the finding: **Minor NC**, **Major NC**, **OFI** or
   **Conformity**; tick **Systemic** if it's one requirement breached in
   multiple places; add a **Grading rationale**.

**Corrective action loop** (appears for Minor/Major NC, ISO 45001 cl. 10.2):

1. Click **Start corrective action**.
2. Set the **Intent** — *Correction* (immediate containment), *Corrective
   Action* (eliminate the cause) or *Preventive Action*.
3. Record the **Correction**, a **Root-cause method** (Five Whys / Fishbone /
   Fault Tree / Other), the **Root cause**, and the **Corrective action**.
4. Assign an **Owner** and a **Due date**.
5. When the action is done, **Mark implemented**.
6. 🔒 Lead **Verify effectiveness:** enter what you checked, then **Effective — close**
   (closes the CAPA) or **Not effective** (reopens the finding). *Verification
   requires connectivity.*

All fields autosave. Overdue CAPAs surface on the Overview, in Actions and in
notifications.

---

## 7. Registers — the 25 OH&S registers

**Purpose:** structured capture of OH&S evidence and findings aligned to ISO
45001 clauses 4–10. Registers are where you systematically record what you
saw and the records you sampled.

**How registers work (common pattern):**

- Pick a register from the **tabs**.
- Read the collapsible **"What to look for"** panel for clause guidance,
  typical nonconformities and questions to ask.
- Click **Add** to create a record; fill the fields — everything **autosaves**
  (a "Saved" toast confirms) and works offline.
- Most records carry **result buttons** — **Conform**, **Nonconform**,
  **Follow-up**, **N/A** — to mark the audit outcome for that row.
- **Export CSV** downloads the active register (client-side, offline-capable).
- Removing a record asks for confirmation.

**The 25 registers** (clause references by number/title only):

| Tab | Clause | Captures |
|-----|--------|----------|
| Hazards & risk | 6.1.2 | Hazard, task, potential harm, severity/likelihood, risk band, control hierarchy, existing controls |
| Risks/opps | 6.1 | Risks & opportunities, significance, treatment |
| Legal & other | 6.1.3 | Compliance obligations, status, and a timestamped **evaluation history** |
| Objectives | 6.2 | OH&S objectives, targets, owners, progress |
| Consultation | 5.4 | Worker consultation & participation: topic, mechanism, group, evidence, outcome |
| Resources | 7.1 | Resources and adequacy |
| Competence | 7.2 | Role competence requirements & status |
| Awareness | 7.3 | Awareness topics, audience, method |
| Comms | 7.4 | Internal/external communications |
| Documents | 7.5 | Documented information & control, review status, with **file attachments** |
| Emergency | 8.2 | Emergency preparedness scenarios & drills |
| Parties | 4.2 | Interested parties and their needs |
| Performance | 9.1 | Monitoring indicators, baseline/target/actual, trend, variance |
| Permits | 6.1.3 | Permits/licences/consents with **expiry status** alerts |
| Incidents | 10.2 | Incident & near-miss investigations, injury classification, RIDDOR flag, status |
| HIRA (6.1.2) | 6.1.2 | Full hazard ID & risk assessment with **initial vs residual** risk bands |
| Calibration | 9.1.1 | Monitoring/measuring equipment calibration with due status |
| Training | 7.2 | Training matrix per person with expiry status |
| Contractors | 8.1.4 | Procurement/contractor evaluation & re-evaluation status |
| Change (MoC) | 8.1.3 | Management of change, risk reassessment, status |
| Operational controls | 8.1.2 | Controls & safe systems of work, effectiveness, seen-in-use |
| Leadership & policy | 5.1/5.2/5.3 | Leadership commitments, policy attributes, roles & responsibilities |
| Context & scope | 4.1/4.2/4.3 | Context issues, interested parties, scope & boundaries |
| Interviews | 9.2 | Planned/done interviews, interviewee, focus, key points |
| Mgmt review | 9.3 | Management-review inputs, decisions, actions |

Many registers auto-calculate risk bands (severity × likelihood) and show
status badges (review due, permit/training/calibration expiry, MoC attention).

---

## 8. People & Sites

**Purpose:** reusable master lists of **Workers** and **Sites** so you reference
the same people and locations consistently across competence, training,
consultation and multi-site sampling.

- **Workers** tab → **Add worker**: Name, Role / function, Employee reference,
  Competence summary, and an **Active** toggle (inactive people drop out of
  pickers elsewhere).
- **Sites** tab → **Add site**: Name, Site reference, Address, Activities.

Everything autosaves; **Remove** asks for confirmation.

---

## 9. Requests — evidence from the client

**Purpose:** ask the audited organisation for documents and records, then review
what they upload. This is the auditor side of the
[Client portal](auditee-guide.md).

**What you see:** KPIs — **To review**, **With the client**, **Overdue**,
**Accepted** — and a list of requests sorted action-needed-first.

**Raise a request:**

1. In **Request evidence from the client**, fill **What do you need?**
   (required, e.g. *"Current calibration certificate for gas detector GD-03"*).
2. Optionally add **Detail / instructions**, **Clause**, **Clause title** and a
   **Due date**.
3. Click **Raise request**. It goes to the client with status **Requested**.

**The request lifecycle:**

| Status | Meaning | Who acts next |
|--------|---------|---------------|
| **Requested** | You've asked; nothing uploaded yet | Client uploads |
| **Submitted — under review** | Client uploaded evidence | You review |
| **Accepted** | You approved it; closed | — |
| **Returned for follow-up** | You sent it back with feedback | Client re-submits |

**Review a submission:** open the request to see the uploaded file(s), size,
who submitted and when, plus any note. Then:

- **Accept** (enabled once something is submitted) — marks it accepted.
- **Return for follow-up** — opens a box to explain what's still needed
  (min 5 chars) and sends it back.

You can **Message the client…** on any request; the two-way thread is shown on
both sides.

---

## 10. Report — conclusions, sign-off & integrity

**Purpose:** compose the audit report, obtain the lead auditor's sign-off, and
prove the record hasn't been tampered with.

**Readiness.** A **pre-signoff readiness** checklist shows whether all clauses
are answered, nonconformities are closed, evidence is captured and changes are
synced. Address the fails before signing.

**Report details** 🔒 Lead: audit type (Stage 1 / Stage 2 / Surveillance /
Recertification / Internal), scope, objectives, sites & sampling, lead-auditor
name and competence, distribution list, and an **Impartiality declared** check.

**Conclusions** 🔒 Lead:

1. **Generate draft** auto-writes the conclusions from the audit's own results
   (AI when Live, rule-based offline): overall conformity, OH&SMS effectiveness
   opinion, degree criteria were met, and any unresolved diverging opinions.
2. Review and edit **every** field.
3. Choose a **Recommendation** (Recommend / Conditional / Not recommended /
   Satisfactory / Action required).

**Sign-off** 🔒 Lead: when ready, enter an **Attestation** (≥ 20 characters) and click
**Sign report**. The signature records a content hash; **Verify integrity**
confirms the report hasn't changed since signing, and a second **Verify
integrity** checks the tamper-evident **change-log hash-chain**.

**Exports (all auditors):**

- **Export working papers** — JSON + findings CSV for the offline archive.
- **Download audit trail** — the ledger chain for external verification.
- **Generate PDF** — opens the print-friendly report; use your browser's *Save
  as PDF*. The printable report includes scope/objectives, conclusions,
  nonconformities & CAPAs, OFIs, the checklist results, and every non-empty
  register.

A read-only **activity log** shows recent key actions.

---

## 11. Programme — the certification cycle

**Purpose:** plan and track the wider audit programme around this engagement —
the certification cycle, internal audits, certificates, complaints/appeals, and
planning aids.

Highlights:

- **Start programme**, set the **Cycle year**, and **Add planned audit**s
  (Stage 1/2, Surveillance, Recertification, Internal, Special) with due dates,
  status, and **planned vs actual days** (variance auto-calculated, per IAF MD
  5).
- **Internal audit programme** (cl. 9.2): scope area, internal auditor, planned
  date (overdue is flagged), impartiality, and findings/follow-up.
- **Auditor competence & impartiality**: record qualifications and declarations.
- **Planning aids**: an **audit-time estimator** (recommended days from
  personnel, complexity and stage) and a **site-sampling calculator** (√N rule,
  IAF MD 1).
- **Certificates**: number, organisation, scope, issued/expires, with status
  transitions and history.
- **Complaints & appeals**: log, track status and due dates (overdue flagged),
  and record resolutions.
- A **Schedule & deadlines** timeline groups upcoming audits, permits and
  complaints by month with click-through links.

---

## 12. Analytics

**Purpose:** a portfolio-level view across **all** audits in the tenant.

You get clickable KPI cards (Audits, Open NCs, Major/Minor NCs, OFIs, CAPA
overdue, Internal overdue, Closed NCs), bar charts of **audits by status** and
**by type**, the **findings breakdown** (Major/Minor/OFI), **CAPA status**,
**programme health** (planned vs completed, internal-audit completion), and
**findings by clause group** and **by month** (trend).

> Findings & CAPA figures reflect the **currently selected audit**, while status
> and programme rollups span the **whole portfolio** — a banner reminds you when
> both are in play.

Click any KPI to drill into the underlying screen.

---

## 13. Retention

**Purpose:** records-retention and legal-hold governance. Retain-until dates are
computed from a **base date** — the report sign-off date if available, else the
audit end or creation date. If none is set, a banner warns you to sign the
report or set audit dates.

You see KPIs (categories, eligible for disposal, due for review, on legal hold)
and a table of record categories with their retention period, retain-until
date, days remaining, and disposition badge:

- **Active** — retain-until is in the future.
- **Due for review** — within 30 days.
- **Eligible for disposal** — retain-until has passed.
- **On legal hold** — protected regardless.

Toggle **Legal hold** on any category that must be retained despite reaching its
retain-until date (e.g. disputes or litigation). Defaults are Trainovate-
authored and tunable per accreditation/contract.

---

## 14. Actions & alerts

**Purpose:** one prioritised "what needs my attention" list across the whole
system. The **Actions** nav item carries a badge with the critical + warning
count.

Alerts are grouped by severity:

- **Critical** — overdue CAPAs, unresolved Major NCs, expired/expiring-today
  permits, high-severity open incidents, overdue internal audits.
- **Needs attention** — Minor NCs, permits expiring soon, CAPA due soon,
  internal audits due soon, overdue complaints/appeals, **unsynced changes**.
- **For information** — open OFIs, internal audits planned soon, valid permits,
  complaints in progress.

Each item shows a relative due label (e.g. "3d overdue", "due today") and links
straight to its detail screen. Clear the critical list first; an **All clear**
state appears when nothing is outstanding.

---

## 15. Help tools: Copilot, Field guide & Manual

These three are always available from the top bar and contain **no tenant data**
— they're reference tools.

### Auditor copilot (robot icon)

Ask about any ISO 45001 clause — what to look for, evidence to request, how to
grade a finding. Answers come from the in-app field guide (offline) or the AI
when configured, and each is labelled **Field guide** or **AI** with clickable
clause references. Type a question (or pick a starter chip) and send. Guidance
only — verify against the standard and your own judgement.

### Auditor's field guide (school icon)

A clause-by-clause reference (ISO 45001 cl. 4–10). For each clause it lists
**What to look for**, **Evidence to request**, **Questions to ask** and
**Typical nonconformities**. It also covers the audit step-by-step and how to
grade findings (major vs minor vs OFI). Filter by clause number/title or use the
jump index. The copilot deep-links here.

### Auditor's manual (book icon)

A methodology reference grounded in ISO 19011 and ISO/IEC 17021-1: audit
principles & ethics, the audit lifecycle, on-site conduct, report writing &
sign-off, corrective action & verification, competence & CPD, using the app's
registers, and offline field working, plus a glossary. Search by keyword; each
section is deep-linkable.

---

## Quick tips

- **Confirm the active audit** (and that you're in the right tenant) before
  editing anything.
- **Capture at the source** and link every photo/note to a clause or finding.
- **Sync before you lose signal**; check the pending count.
- Treat every **AI draft** as a starting point — you own the wording.
- On the checklist, use **← / →** and **1–5** to move fast.
