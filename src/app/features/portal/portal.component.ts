import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { FieldAuditStore, type FieldEvidenceRequest } from '../../core/field/field-audit-store';
import {
  canAuditeeSubmit,
  evidenceRequestSummary,
  isOverdue,
  requestStatusLabel,
  requestStatusTone,
  sortRequests,
} from '../../core/portal/evidence-requests.logic';
import {
  PortalFinding,
  canRespond,
  isAuditeeRole,
  portalSummary,
  toPortalFinding,
  visibleFindings,
} from '../../core/portal/portal.logic';

interface PendingFile {
  fileName: string;
  mime?: string;
  size?: number;
}

/**
 * Auditee (client) portal — the single place the audited organisation works
 * with the auditor. It has two surfaces:
 *
 *  1. Evidence requests: the auditor's "please provide" list. The auditee sees
 *     what to upload, the status / follow-ups, uploads documents, and messages
 *     the auditor in a per-request thread (ISO 19011 §6.3 evidence collection).
 *  2. Findings: the nonconformities raised against them, which they can
 *     acknowledge with a proposed correction (cl. 10.2 close-out).
 *
 * Authorisation note: the auditee identity is the `clientViewer` role; the API
 * enforces tenant + role scoping. The page degrades to a clear notice for
 * auditor roles previewing it rather than leaking the auditor workspace.
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

  // --- Evidence requests ---------------------------------------------------
  protected readonly requests = computed(() => sortRequests(this.store.evidenceRequests()));
  protected readonly requestSummary = computed(() => evidenceRequestSummary(this.store.evidenceRequests()));

  /** Pending picked file per request id (before the auditee presses Upload). */
  private readonly pending = signal<Record<string, PendingFile>>({});
  /** Per-request submission note and thread-message drafts. */
  private readonly notes = signal<Record<string, string>>({});
  private readonly messages = signal<Record<string, string>>({});

  protected pendingFile(id: string): PendingFile | null {
    return this.pending()[id] ?? null;
  }

  protected note(id: string): string {
    return this.notes()[id] ?? '';
  }

  protected setNote(id: string, value: string): void {
    this.notes.update((map) => ({ ...map, [id]: value }));
  }

  protected message(id: string): string {
    return this.messages()[id] ?? '';
  }

  protected setMessage(id: string, value: string): void {
    this.messages.update((map) => ({ ...map, [id]: value }));
  }

  protected onPickFile(id: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.item(0);
    if (!file) return;
    this.pending.update((map) => ({ ...map, [id]: { fileName: file.name, mime: file.type || undefined, size: file.size } }));
  }

  protected canSubmit(req: FieldEvidenceRequest): boolean {
    return canAuditeeSubmit(req);
  }

  /** Upload the picked file and/or note as a submission against the request. */
  protected submit(req: FieldEvidenceRequest): void {
    const file = this.pendingFile(req.id);
    const note = this.note(req.id).trim();
    if (!file && !note) return;
    this.store.submitEvidence(
      req.id,
      { fileName: file?.fileName, mime: file?.mime, size: file?.size, note: note || undefined },
      this.auditeeName(),
    );
    this.pending.update((map) => {
      const next = { ...map };
      delete next[req.id];
      return next;
    });
    this.notes.update((map) => {
      const next = { ...map };
      delete next[req.id];
      return next;
    });
  }

  protected sendMessage(req: FieldEvidenceRequest): void {
    const text = this.message(req.id).trim();
    if (!text) return;
    this.store.postRequestMessage(req.id, 'auditee', this.auditeeName(), text);
    this.messages.update((map) => {
      const next = { ...map };
      delete next[req.id];
      return next;
    });
  }

  protected requestStatusLabel(req: FieldEvidenceRequest): string {
    return requestStatusLabel(req.status);
  }

  protected requestStatusTone(req: FieldEvidenceRequest): string {
    return requestStatusTone(req.status);
  }

  protected overdue(req: FieldEvidenceRequest): boolean {
    return isOverdue(req);
  }

  protected formatSize(bytes: number | undefined): string {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected formatTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private auditeeName(): string {
    return this.auth.user()?.displayName?.trim() || 'Auditee contact';
  }

  // --- Findings (cl. 10.2) -------------------------------------------------
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

  protected submitResponse(finding: PortalFinding): void {
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
