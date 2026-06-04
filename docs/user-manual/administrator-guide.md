# Administrator guide

This guide covers the two administrative roles:

- **Tenant Admin / Lead Auditor** — manage the people in your own workspace from
  the **Users** screen.
- **Platform Superadmin** — onboard whole client tenants and provision their
  users from the separate **/admin** console.

For roles and the sign-in basics, see [Getting started](getting-started.md).

---

## Part A — Managing members (Tenant Admin / Lead Auditor)

Member management lives on the **Users** screen (left-rail **Users**). It needs
the **live backend** — in Local/Offline/demo mode you'll see *"User management
needs the live backend — Sign in (Live) as a lead auditor or tenant admin to
manage users."*

Who can manage members:

- **Lead Auditor** — invite members, change roles (except granting Tenant
  Admin), reset passwords, deactivate/reactivate.
- **Tenant Admin** — all of the above **plus** grant/revoke the **Tenant
  Admin** role.

### Invite a teammate

1. On **Users**, click **Invite user**.
2. Enter their **Email** and **Display name**, and pick a **Role** (you can only
   assign roles at or below your own authority — Auditor, Lead Auditor, Client
   Viewer, and — for Tenant Admins — Tenant Admin).
3. Click **Send invite**.
4. A confirmation appears: *"Invite sent to <email> — they've been emailed a
   secure, single-use link to set their password."* (In environments without a
   mail provider the link is shown so you can **Copy link** and share it
   directly.)

The invitee follows the link to set their password — see
[Getting started §4](getting-started.md#4-setting-your-password-first-time-in).

### Change someone's role

In the user's tile, use the **Role** dropdown to change it. Notes:

- You can't change your **own** role.
- Only **Tenant Admins** can grant or change the **Tenant Admin** role.
- The dropdown only offers roles you're permitted to assign.

### Reset a password

Click **Reset password** on a user's tile. This generates a fresh single-use
set-password link (shown/emailed as with an invite) so they can choose a new
password.

### Deactivate or reactivate

Click **Deactivate** to remove a user's access (their attribution on historical
records is preserved). Click **Reactivate** to restore it. You **cannot
deactivate your own** account.

### Change my password

At the bottom of **Users**, the **Change my password** panel lets you update
your own password: enter your **Current password**, a **New password** (at least
8 characters) and **Confirm new password**, then click **Update password**.

---

## Part B — Onboarding clients (Platform Superadmin)

The platform superadmin works in a **separate console** and never inside a
tenant workspace.

### Sign in to the console

1. From the normal sign-in page, click **Platform administrator sign-in** (or go
   to `/admin/login`).
2. Enter your **Email** and **Password** and click **Sign in**. You land on the
   **Platform console** (`/admin`).

### Onboard a client

The **Onboard a client** panel creates the client's tenant, its lead auditor,
and the client's users in one step — *"Each person gets a secure link to set
their own password."*

1. Enter the **Client / organisation name** and choose a **Plan** (*pilot*,
   *team* or *enterprise*).
2. Under **Lead auditor**, enter the lead auditor's **Name** and **Email**.
3. Under **Client users (auditee contacts)**, add one row per client contact
   (**Name** + **Email**). Use **Add another client user** for more rows, or the
   remove icon to drop one.
4. Click **Create client** (it shows *"Provisioning…"* while it works).
5. The console then lists each new member with a one-time **set-password link** —
   use **Copy link** to share each one (or they're emailed where a provider is
   configured).

### Manage existing clients & their members

The **Clients (N)** panel lists every tenant. Expand a tenant to see its
members, each showing name/email, role, and a status badge (**active**,
**invited** or **disabled**). Per member you can:

- **Resend set-password link** or **Revoke link** (for not-yet-active members),
- **Disable** / **Enable** access,
- and, below the list, **Add** a new member to that tenant with a **Name**,
  **Email** and **Role** (*Client*, *Auditor* or *Lead auditor*).

Use **Sign out** to leave the console.

---

## Onboarding checklist

A quick end-to-end setup sequence:

1. **Superadmin** onboards the client tenant, its lead auditor and client
   contacts; shares the set-password links.
2. Each person **sets their password** via their link and signs in.
3. The **Lead Auditor** (or Tenant Admin) invites any remaining auditors on the
   **Users** screen and confirms roles.
4. The Lead Auditor **creates the first audit** (auditee, scope, criteria) on
   the **Audits** screen — see [Auditor guide §2](auditor-guide.md#2-audits--choose-or-create-the-active-audit).
5. Client contacts sign in to the **Client portal** to receive evidence
   requests — see the [Auditee guide](auditee-guide.md).
