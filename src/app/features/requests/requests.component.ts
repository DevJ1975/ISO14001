import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { FieldAuditStore, type FieldEvidenceRequest } from '../../core/field/field-audit-store';
import {
  evidenceRequestSummary,
  isOverdue,
  requestStatusLabel,
  requestStatusTone,
  sortRequests,
} from '../../core/portal/evidence-requests.logic';

/**
 * Auditor's evidence-request console. The auditor raises requests for the
 * documents/records they need, reviews what the auditee submits through the
 * client portal, accepts or returns each one for follow-up, and converses with
 * the auditee in the per-request thread (ISO 19011 §6.3 evidence collection).
 */
@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestsComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly auth = inject(AuthService);

  protected readonly requests = computed(() => sortRequests(this.store.evidenceRequests()));
  protected readonly summary = computed(() => evidenceRequestSummary(this.store.evidenceRequests()));

  // New-request form fields.
  protected readonly title = signal('');
  protected readonly detail = signal('');
  protected readonly clauseId = signal('');
  protected readonly clauseTitle = signal('');
  protected readonly dueDate = signal('');

  // Per-request reply + return-reason drafts, keyed by request id.
  private readonly replies = signal<Record<string, string>>({});
  private readonly returnReasons = signal<Record<string, string>>({});
  protected readonly returningId = signal<string | null>(null);

  protected reply(id: string): string {
    return this.replies()[id] ?? '';
  }

  protected setReply(id: string, value: string): void {
    this.replies.update((map) => ({ ...map, [id]: value }));
  }

  protected returnReason(id: string): string {
    return this.returnReasons()[id] ?? '';
  }

  protected setReturnReason(id: string, value: string): void {
    this.returnReasons.update((map) => ({ ...map, [id]: value }));
  }

  protected create(): void {
    const title = this.title().trim();
    if (title.length < 3) return;
    this.store.createEvidenceRequest({
      title,
      detail: this.detail(),
      clauseId: this.clauseId(),
      clauseTitle: this.clauseTitle(),
      dueDate: this.dueDate() || undefined,
      createdByName: this.authorName(),
    });
    this.title.set('');
    this.detail.set('');
    this.clauseId.set('');
    this.clauseTitle.set('');
    this.dueDate.set('');
  }

  protected accept(req: FieldEvidenceRequest): void {
    this.store.acceptEvidenceRequest(req.id);
  }

  protected startReturn(id: string): void {
    this.returningId.set(id);
  }

  protected cancelReturn(): void {
    this.returningId.set(null);
  }

  protected confirmReturn(req: FieldEvidenceRequest): void {
    const reason = this.returnReason(req.id).trim();
    if (reason.length < 5) return;
    this.store.returnEvidenceRequest(req.id, reason, this.authorName());
    this.returnReasons.update((map) => {
      const next = { ...map };
      delete next[req.id];
      return next;
    });
    this.returningId.set(null);
  }

  protected sendReply(req: FieldEvidenceRequest): void {
    const text = this.reply(req.id).trim();
    if (!text) return;
    this.store.postRequestMessage(req.id, 'auditor', this.authorName(), text);
    this.replies.update((map) => {
      const next = { ...map };
      delete next[req.id];
      return next;
    });
  }

  protected statusLabel(req: FieldEvidenceRequest): string {
    return requestStatusLabel(req.status);
  }

  protected statusTone(req: FieldEvidenceRequest): string {
    return requestStatusTone(req.status);
  }

  protected overdue(req: FieldEvidenceRequest): boolean {
    return isOverdue(req);
  }

  protected formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString([], { dateStyle: 'medium' });
  }

  protected formatTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  protected formatSize(bytes: number | undefined): string {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private authorName(): string {
    return this.auth.user()?.displayName?.trim() || 'Lead auditor';
  }
}
