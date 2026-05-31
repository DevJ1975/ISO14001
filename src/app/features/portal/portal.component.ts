import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { FieldAuditStore } from '../../core/field/field-audit-store';
import {
  PortalFinding,
  canRespond,
  isAuditeeRole,
  portalSummary,
  toPortalFinding,
  visibleFindings,
} from '../../core/portal/portal.logic';

/**
 * Auditee portal — a scoped, read-mostly view for the audited organisation. They
 * see the findings raised against them and can acknowledge each one with a
 * proposed correction (cl. 10.2 close-out). No access to the auditor workspace:
 * the view shows only the auditee-appropriate projection of each finding.
 *
 * Authorisation note: in this environment the auditee identity is the existing
 * `clientViewer` role. A production deployment would put this behind a separate
 * auditee login / invite + tenant-scoped authorisation; that external auth wiring
 * is out of scope here and the page degrades to a clear "not available" state for
 * non-auditee roles rather than leaking the auditor view.
 */
@Component({
  selector: 'app-portal',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './portal.component.html',
  styleUrl: './portal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly auth = inject(AuthService);

  protected readonly isAuditee = computed(() => isAuditeeRole(this.auth.user()?.role));

  private readonly portalFindings = computed<PortalFinding[]>(() =>
    visibleFindings(this.store.findings().map(toPortalFinding)),
  );

  protected readonly findings = this.portalFindings;
  protected readonly summary = computed(() => portalSummary(this.store.findings().map(toPortalFinding)));

  /** Per-finding draft response text, keyed by finding id. */
  private readonly drafts = signal<Record<string, string>>({});
  protected readonly saved = signal<string | null>(null);

  protected draft(id: string): string {
    return this.drafts()[id] ?? '';
  }

  protected setDraft(id: string, value: string): void {
    this.drafts.update((map) => ({ ...map, [id]: value }));
  }

  protected canRespond(finding: PortalFinding): boolean {
    return canRespond(finding);
  }

  protected gradeLabel(type: PortalFinding['type']): string {
    return type === 'majorNc' ? 'Major NC' : type === 'minorNc' ? 'Minor NC' : type === 'ofi' ? 'OFI' : 'Conformity';
  }

  protected statusLabel(status: PortalFinding['status']): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  protected submit(finding: PortalFinding): void {
    const text = this.draft(finding.id).trim();
    if (text.length < 10) {
      this.saved.set(null);
      return;
    }
    this.store.acknowledgeFinding(finding.id, text);
    this.drafts.update((map) => {
      const next = { ...map };
      delete next[finding.id];
      return next;
    });
    this.saved.set(finding.id);
  }

  protected formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString([], { dateStyle: 'medium' });
  }
}
