# Getting started

This page covers the things every user needs before diving into their role:
the core concepts, how to sign in, what the screen is made of, and how the app
behaves online and offline. **Read this first**, then continue to your role
guide:

- Auditors → [Auditor guide](auditor-guide.md)
- Clients / audited organisations → [Auditee guide](auditee-guide.md)
- Admins → [Administrator guide](administrator-guide.md)

---

## 1. Core concepts

| Concept | What it means |
|---------|----------------|
| **Tenant** | An isolated workspace — one audit firm or client account. All users, audits and evidence belong to exactly one tenant and never leak across tenants. You belong to one tenant (platform superadmins are the exception). |
| **Audit** | A single engagement against an audited organisation, for a chosen **criteria** edition (e.g. *ISO 45001:2018*). The **active audit** drives every screen. |
| **Criteria** | The standard edition the audit is run against. The app offers **ISO 45001:2018** and a **ISO 45001:2026** placeholder. |
| **Role** | Determines what you can do (see the table below). |
| **Active audit** | The one audit currently selected on the **Audits** screen. Overview, Fieldwork, Findings, Registers and Report all reflect it. |
| **Outbox** | The queue of unsynced changes held on your device while offline. |

---

## 2. Roles & permissions

There are four working roles plus a platform-level superadmin. Your role is set
by an administrator and shown under your name in the bottom-left of the
workspace.

| Role | Where they work | Can do |
|------|-----------------|--------|
| **Auditor** | Full workspace | Fieldwork, evidence, notes, draft findings, registers, requests, reports (view/export). Cannot manage members. |
| **Lead Auditor** | Full workspace | Everything an Auditor can, **plus**: create audits, advance audit status, generate agendas/scripts, **grade** findings, verify corrective-action effectiveness, **sign** the report, and manage members. |
| **Tenant Admin** | Full workspace | Same workspace access as an auditor, plus full member management **including granting the Tenant Admin role**. |
| **Client Viewer (Auditee)** | **Client portal only** | Upload requested evidence, message the auditor, and respond to findings raised against their organisation. Cannot see the auditor workspace. |
| **Platform Superadmin** | Separate **/admin** console | Onboard client tenants, provision lead auditors and client users, and manage members across all tenants. Does not work inside a tenant workspace. |

Lead-auditor-only actions are called out throughout the [Auditor
guide](auditor-guide.md). Member management is in the [Administrator
guide](administrator-guide.md).

---

## 3. Signing in

Open the app and you land on the **Sign in** screen ("Authenticate to load the
live audit workspace").

**To sign in normally:**

1. Enter your **Email** and **Password**.
2. Click **Sign in** (it shows "Signing in…" while it works).
3. You are routed automatically:
   - Auditors / Lead Auditors / Tenant Admins → the **Overview** workspace.
   - Client Viewers (auditees) → the **Client portal**.

If sign-in fails you'll see: *"Sign-in failed. Check the credentials, or that
the backend is configured."* Confirm your email/password with whoever invited
you.

**First time in?** You should have received a one-time **set-password** email —
see [Setting your password](#4-setting-your-password-first-time-in) below.

**Demo / evaluation modes.** The sign-in screen also offers two offline demo
buttons that need no account and run entirely on the on-device store:

- **Demo as auditor** — opens the full workspace in **Local** mode.
- **Demo as client (auditee)** — opens the **Client portal** in **Local** mode.

Demo mode is great for training and exploration, but it cannot manage users or
reach the live backend.

**Administrators** sign in through a separate link — **Platform administrator
sign-in** at the bottom of the page (covered in the [Administrator
guide](administrator-guide.md)).

---

## 4. Setting your password (first time in)

When an administrator invites you (or resets your password) you receive an
email with a single-use **set-password** link.

1. Open the link. The app checks it ("Checking your link…").
2. If the link is valid, you'll see **Set your password** with your email.
3. Enter a **New password** (at least 8 characters) and **Confirm password**.
4. Click **Set password**.
5. On success you'll see **Password set** — click **Go to sign in**.

If the link has expired you'll see *"Link invalid or expired"* — ask your
administrator to send a new one.

You can change your password later from the **Users** screen (see
[Administrator guide → Change my password](administrator-guide.md#change-my-password)).

---

## 5. The workspace layout

Once signed in as an auditor, the screen has three persistent areas.

### Left rail (primary navigation)

- **Brand**: the *Soteria Signum — ISO 45001 · by Trainovate* mark.
- **Navigation links** — the modules listed in the
  [module map](README.md#module-map-feature-inventory). The **Actions** link
  shows a red badge with the number of critical + warning alerts.
- **Footer**:
  - **Who you are** — your name and role.
  - **Connection status** — *Online/Offline*, the data source (*Live API* or
    *Local*), and a count of **pending** (unsynced) changes.
  - **Sync now** — appears when you are online and have pending changes.

On narrow screens the rail collapses to a **bottom tab bar** with the same
destinations.

### Top bar (global tools)

From left to right:

- **Source pill** — **Live**, **Local** or **Offline** (see
  [the data-source indicator](#6-live-local--offline-the-data-source-indicator)).
  Tap it to sync.
- **Local conditions** — current weather and a clock/date (handy on site).
- **Search (⌘K / Ctrl-K)** — opens the **command palette** to jump to any
  screen by name or keyword.
- **Take a tour** — replays the guided onboarding tour.
- **Auditor's field guide** (school icon) — clause-by-clause "what to look for".
- **Auditor's manual** (book icon) — audit methodology reference.
- **Auditor copilot** (robot icon) — ask-the-standard AI assistant.
- **Notifications** (bell) — shows unread count; opens the notifications panel.
- **Theme** — toggle light / dark mode.
- **Sign out**.

### Main area

The screen you've navigated to. There's also a **first-run welcome** and a
**guided tour** that launches automatically the first time you sign in; you can
dismiss it and replay it anytime from **Take a tour**.

---

## 6. Live, Local & Offline (the data-source indicator)

The **source pill** in the top bar always tells you where your data is coming
from and going:

| Pill | Meaning |
|------|---------|
| **Live** | You're signed in and connected to the live backend. Reads and writes go to the server. |
| **Local** | You're working against the on-device store (e.g. demo mode, or the backend isn't connected). Your work is saved locally. |
| **Offline** | No connectivity. Changes are queued on this device and will sync when you reconnect. |

A small badge on the pill shows how many changes are **pending** sync. Tapping
the pill triggers a sync.

Some actions require connectivity and are disabled in Local/Offline mode — for
example **user management** ("User management needs the live backend") and
**verifying corrective-action effectiveness**.

---

## 7. Working offline & syncing

The app is built to keep working with no signal:

- Keep capturing notes, photos, checklist decisions and register entries
  normally — everything autosaves to the device.
- The footer and source pill show a **pending** count of queued changes.
- When connectivity returns, changes sync automatically; you can also force it
  with **Sync now** (rail footer) or by tapping the **source pill**.
- Evidence records keep a local identifier until their upload is confirmed; a
  photo shows **On this device only** until it is **Stored in the cloud**.

**Field habit:** open every audit you'll need *while you still have signal* so
its checklist and context are cached, and **sync before you leave** reliable
connectivity.

---

## 8. Notifications

The **bell** in the top bar opens the notifications panel, built from the live
alerts engine (overdue CAPAs and actions, expiring permits, lapsed training,
calibration due, and more).

- An unread count appears on the bell.
- Each notification shows a severity icon, title, category and (if relevant) a
  due date; click it to jump straight to the item.
- **Mark all read** clears the unread state; **Settings** opens
  **Notification settings**.

**Notification settings** (per user) let you choose:

- **Channels** — *In-app* (always on), *Email* (optional), *Push* (browser
  notifications; you'll be asked to allow them).
- **Minimum severity** — *Everything*, *Warnings & critical*, or *Critical
  only*.
- **Muted categories** — silence specific alert categories on all channels.

Changes save immediately (there's no submit button).

---

## 9. The command palette & keyboard shortcuts

- **⌘K / Ctrl-K** (or the search icon) opens the **command palette**. Type a
  screen name or keyword (e.g. "capa", "hazard", "schedule") and jump straight
  there.
- On the **Fieldwork** checklist, **← / →** move between clauses and **1–5**
  record a decision (see [Auditor guide §4](auditor-guide.md#4-fieldwork--the-checklist)).

---

Next: pick your role guide — [Auditor](auditor-guide.md),
[Auditee](auditee-guide.md) or [Administrator](administrator-guide.md).
