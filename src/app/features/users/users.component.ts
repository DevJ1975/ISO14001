import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { FieldApiService, type Member } from '../../core/field/field-api.service';

const ROLE_LABELS: Record<string, string> = {
  tenantAdmin: 'Tenant admin',
  leadAuditor: 'Lead auditor',
  auditor: 'Auditor',
  clientViewer: 'Client viewer',
};

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent {
  private readonly api = inject(FieldApiService);
  private readonly auth = inject(AuthService);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly assignableRoles = ['auditor', 'leadAuditor', 'clientViewer', 'tenantAdmin'];
  /** Placeholder rows rendered while members load. */
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly members = signal<Member[]>([]);
  protected readonly loading = signal(true);
  protected readonly live = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly canManage = computed(() => ['leadAuditor', 'tenantAdmin'].includes(this.auth.user()?.role ?? ''));
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'tenantAdmin');
  protected readonly myUid = computed(() => this.auth.user()?.uid ?? '');

  protected readonly showInvite = signal(false);
  protected readonly inviting = signal(false);
  protected readonly inviteRole = signal('auditor');
  /** Set-password link to share with a newly invited / reset user (dev exposes it inline). */
  protected readonly handoff = signal<{ email: string; link?: string } | null>(null);

  protected readonly changingPw = signal(false);
  protected readonly pwMessage = signal<string | null>(null);
  protected readonly pwError = signal<string | null>(null);

  // --- TOTP MFA self-service (the signed-in user's own account) ---
  protected readonly mfaEnabled = signal<boolean | null>(null);
  protected readonly mfaEnrolling = signal(false);
  /** The secret + otpauth URI shown once during enrolment (added to an authenticator). */
  protected readonly mfaEnrollment = signal<{ secret: string; otpauthUri: string } | null>(null);
  protected readonly mfaCode = signal('');
  protected readonly mfaBusy = signal(false);
  protected readonly mfaError = signal<string | null>(null);
  protected readonly mfaMessage = signal<string | null>(null);

  constructor() {
    void this.load();
    void this.loadMfa();
  }

  private async loadMfa(): Promise<void> {
    try {
      this.mfaEnabled.set((await this.api.mfaStatus()).enabled);
    } catch {
      // Offline/local mode or not signed in to the live backend — hide the MFA card.
      this.mfaEnabled.set(null);
    }
  }

  /** Begin enrolment: fetch a fresh secret + otpauth URI to add to an authenticator. */
  protected async startMfaEnroll(): Promise<void> {
    this.mfaError.set(null);
    this.mfaMessage.set(null);
    this.mfaBusy.set(true);
    try {
      const result = await this.api.mfaEnroll();
      this.mfaEnrollment.set({ secret: result.secret, otpauthUri: result.otpauthUri });
      this.mfaEnrolling.set(true);
    } catch (err: unknown) {
      this.mfaError.set(this.messageFrom(err, 'Could not start MFA enrolment.'));
    } finally {
      this.mfaBusy.set(false);
    }
  }

  /** Verify the first code to activate MFA. */
  protected async activateMfa(): Promise<void> {
    this.mfaError.set(null);
    if (!/^[0-9]{6}$/.test(this.mfaCode().trim())) {
      this.mfaError.set('Enter the 6-digit code from your authenticator app.');
      return;
    }
    this.mfaBusy.set(true);
    try {
      const result = await this.api.mfaActivate(this.mfaCode().trim());
      this.mfaEnabled.set(result.enabled);
      this.mfaEnrolling.set(false);
      this.mfaEnrollment.set(null);
      this.mfaCode.set('');
      this.mfaMessage.set('Two-factor authentication is on.');
    } catch (err: unknown) {
      this.mfaError.set(this.messageFrom(err, 'That code did not match. Try again.'));
    } finally {
      this.mfaBusy.set(false);
    }
  }

  /** Disable MFA (requires a current valid code). */
  protected async disableMfa(): Promise<void> {
    this.mfaError.set(null);
    if (!/^[0-9]{6}$/.test(this.mfaCode().trim())) {
      this.mfaError.set('Enter a current 6-digit code to turn MFA off.');
      return;
    }
    this.mfaBusy.set(true);
    try {
      const result = await this.api.mfaDisable(this.mfaCode().trim());
      this.mfaEnabled.set(result.enabled);
      this.mfaCode.set('');
      this.mfaMessage.set('Two-factor authentication is off.');
    } catch (err: unknown) {
      this.mfaError.set(this.messageFrom(err, 'Could not disable MFA.'));
    } finally {
      this.mfaBusy.set(false);
    }
  }

  protected cancelMfaEnroll(): void {
    this.mfaEnrolling.set(false);
    this.mfaEnrollment.set(null);
    this.mfaCode.set('');
    this.mfaError.set(null);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.members.set(await this.api.listMembers());
      this.live.set(true);
    } catch {
      // Not signed in to the live backend (Local/Offline mode) or not permitted.
      this.live.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  protected roleLabel(role: string): string {
    return this.roleLabels[role] ?? role;
  }

  protected canEditRole(role: string): boolean {
    // Only an admin may grant tenantAdmin; everyone managing can set the rest.
    return role !== 'tenantAdmin' || this.isAdmin();
  }

  protected async invite(email: string, displayName: string): Promise<void> {
    this.error.set(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (displayName.trim().length < 2) {
      this.error.set('Enter the person’s name.');
      return;
    }
    this.inviting.set(true);
    try {
      const result = await this.api.createMember({ email: email.trim(), displayName: displayName.trim(), role: this.inviteRole() });
      this.handoff.set({ email: result.member.email, link: result.setPasswordLink });
      this.showInvite.set(false);
      await this.load();
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not invite the user.'));
    } finally {
      this.inviting.set(false);
    }
  }

  protected async setRole(member: Member, role: string): Promise<void> {
    if (role === member.role) return;
    this.error.set(null);
    try {
      const result = await this.api.updateMember(member.uid, { role });
      this.replace(result.member);
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not change the role.'));
      await this.load();
    }
  }

  protected async toggleStatus(member: Member): Promise<void> {
    this.error.set(null);
    const status = member.status === 'active' ? 'disabled' : 'active';
    try {
      const result = await this.api.updateMember(member.uid, { status });
      this.replace(result.member);
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not update the user.'));
    }
  }

  protected async resetPassword(member: Member): Promise<void> {
    this.error.set(null);
    try {
      const result = await this.api.resetMemberPassword(member.uid);
      this.handoff.set({ email: member.email, link: result.setPasswordLink });
    } catch (err: unknown) {
      this.error.set(this.messageFrom(err, 'Could not reset the password.'));
    }
  }

  protected async changePassword(current: string, next: string, confirm: string): Promise<void> {
    this.pwError.set(null);
    this.pwMessage.set(null);
    if (next.length < 8) {
      this.pwError.set('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      this.pwError.set('New passwords do not match.');
      return;
    }
    this.changingPw.set(true);
    try {
      await this.api.changeOwnPassword(current, next);
      this.pwMessage.set('Password updated.');
    } catch (err: unknown) {
      this.pwError.set(this.messageFrom(err, 'Could not change the password.'));
    } finally {
      this.changingPw.set(false);
    }
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable; the value is shown for manual copy */
    }
  }

  private replace(member: Member): void {
    this.members.update((list) => list.map((m) => (m.uid === member.uid ? member : m)));
  }

  private messageFrom(err: unknown, fallback: string): string {
    const error = (err as { error?: { error?: string } })?.error?.error;
    return typeof error === 'string' && error ? error : fallback;
  }
}
