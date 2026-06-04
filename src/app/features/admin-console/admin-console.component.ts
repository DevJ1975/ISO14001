import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import {
  AdminApiService,
  type ProvisionUserInput,
  type ProvisionedMember,
} from '../../core/admin/admin-api.service';
import { AuthService } from '../../core/auth/auth.service';
import type { AdminMemberView, AdminTenantView } from '../../core/domain';

interface ClientRow {
  email: string;
  displayName: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ROLE_LABELS: Record<string, string> = {
  tenantAdmin: 'Tenant admin',
  leadAuditor: 'Lead auditor',
  auditor: 'Auditor',
  clientViewer: 'Client',
};

/**
 * Platform-superadmin console: provision a client (tenant) with its lead auditor
 * and client users in one step, then manage each tenant's users (resend/revoke
 * the set-password link, disable/enable accounts).
 */
@Component({
  selector: 'app-admin-console',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './admin-console.component.html',
  styleUrl: './admin-console.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConsoleComponent {
  private readonly api = inject(AdminApiService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly plans = ['pilot', 'team', 'enterprise'] as const;

  protected readonly tenants = signal<AdminTenantView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  // Create-client form
  protected readonly tenantName = signal('');
  protected readonly plan = signal<'pilot' | 'team' | 'enterprise'>('pilot');
  protected readonly auditorEmail = signal('');
  protected readonly auditorName = signal('');
  protected readonly clientRows = signal<ClientRow[]>([{ email: '', displayName: '' }]);
  protected readonly provisioning = signal(false);
  protected readonly provisioned = signal<{ tenantId: string; members: ProvisionedMember[] } | null>(null);

  // Per-tenant member management
  protected readonly expanded = signal<string | null>(null);
  protected readonly members = signal<Record<string, AdminMemberView[]>>({});
  protected readonly links = signal<Record<string, string>>({}); // uid -> set-password link
  protected readonly addEmail = signal('');
  protected readonly addName = signal('');
  protected readonly addRole = signal<'leadAuditor' | 'auditor' | 'clientViewer'>('clientViewer');

  protected readonly canProvision = computed(
    () =>
      this.tenantName().trim().length > 1 &&
      EMAIL_RE.test(this.auditorEmail().trim()) &&
      this.auditorName().trim().length > 1 &&
      !this.provisioning(),
  );

  constructor() {
    void this.loadTenants();
  }

  private async loadTenants(): Promise<void> {
    this.loading.set(true);
    try {
      this.tenants.set(await this.api.listTenants());
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not load tenants. Are you signed in as a superadmin?'));
    } finally {
      this.loading.set(false);
    }
  }

  // --- Create client -------------------------------------------------------
  protected addClientRow(): void {
    this.clientRows.update((rows) => [...rows, { email: '', displayName: '' }]);
  }

  protected removeClientRow(index: number): void {
    this.clientRows.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected setClientRow(index: number, field: keyof ClientRow, value: string): void {
    this.clientRows.update((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  protected async provision(): Promise<void> {
    if (!this.canProvision()) return;
    this.provisioning.set(true);
    this.error.set(null);
    const clientUsers: ProvisionUserInput[] = this.clientRows()
      .filter((r) => EMAIL_RE.test(r.email.trim()) && r.displayName.trim().length > 0)
      .map((r) => ({ email: r.email.trim(), displayName: r.displayName.trim(), role: 'clientViewer' }));
    try {
      const result = await this.api.provisionClient({
        tenantName: this.tenantName().trim(),
        plan: this.plan(),
        leadAuditor: { email: this.auditorEmail().trim(), displayName: this.auditorName().trim() },
        clientUsers,
      });
      this.provisioned.set(result);
      this.tenantName.set('');
      this.auditorEmail.set('');
      this.auditorName.set('');
      this.clientRows.set([{ email: '', displayName: '' }]);
      await this.loadTenants();
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not provision the client.'));
    } finally {
      this.provisioning.set(false);
    }
  }

  // --- Manage tenant members ----------------------------------------------
  protected async toggle(tenantId: string): Promise<void> {
    if (this.expanded() === tenantId) {
      this.expanded.set(null);
      return;
    }
    this.expanded.set(tenantId);
    this.addEmail.set('');
    this.addName.set('');
    this.addRole.set('clientViewer');
    await this.loadMembers(tenantId);
  }

  private async loadMembers(tenantId: string): Promise<void> {
    try {
      const list = await this.api.listMembers(tenantId);
      this.members.update((map) => ({ ...map, [tenantId]: list }));
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not load members.'));
    }
  }

  protected membersFor(tenantId: string): AdminMemberView[] {
    return this.members()[tenantId] ?? [];
  }

  protected async addMember(tenantId: string): Promise<void> {
    if (!EMAIL_RE.test(this.addEmail().trim()) || this.addName().trim().length < 2) {
      this.error.set('Enter a valid email and name for the new user.');
      return;
    }
    this.error.set(null);
    try {
      const result = await this.api.addMember(tenantId, {
        email: this.addEmail().trim(),
        displayName: this.addName().trim(),
        role: this.addRole(),
      });
      if (result.setPasswordLink) this.links.update((m) => ({ ...m, [result.member.uid]: result.setPasswordLink! }));
      this.addEmail.set('');
      this.addName.set('');
      await this.loadMembers(tenantId);
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not add the user.'));
    }
  }

  protected async resend(tenantId: string, uid: string): Promise<void> {
    this.error.set(null);
    try {
      const result = await this.api.resendLink(tenantId, uid);
      if (result.setPasswordLink) this.links.update((m) => ({ ...m, [uid]: result.setPasswordLink! }));
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not resend the link.'));
    }
  }

  protected async revoke(tenantId: string, uid: string): Promise<void> {
    this.error.set(null);
    try {
      await this.api.revokeLink(tenantId, uid);
      this.links.update((m) => {
        const next = { ...m };
        delete next[uid];
        return next;
      });
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not revoke the link.'));
    }
  }

  protected async toggleStatus(tenantId: string, member: AdminMemberView): Promise<void> {
    this.error.set(null);
    const status = member.status === 'active' ? 'disabled' : 'active';
    try {
      await this.api.setMemberStatus(tenantId, member.uid, status);
      await this.loadMembers(tenantId);
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not update the user.'));
    }
  }

  protected linkFor(uid: string): string | null {
    return this.links()[uid] ?? null;
  }

  protected roleLabel(role: string): string {
    return this.roleLabels[role] ?? role;
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable; the value is shown for manual copy */
    }
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/admin/login');
  }

  private messageFrom(err: unknown, fallback: string): string {
    const error = (err as { error?: { error?: string } })?.error?.error;
    return typeof error === 'string' && error ? error : fallback;
  }
}
