import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { AlertsService, type ScheduleEvent } from '../../core/alerts/alerts.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  type AuditComplexity,
  type AuditTimeResult,
  type CertificateStatus,
  type CertificationStage,
  type Certificate,
  type ComplaintAppeal,
  type ComplaintKind,
  type ComplaintStatus,
  CERTIFICATE_TRANSITIONS,
  calculateAuditDuration,
  isComplaintOverdue,
  recertificationDue,
  sampleSiteCount,
  selectSampleSites,
  surveillanceDue,
} from '../../core/domain';
import { AuditTypeKind, PlannedStatus, ProgrammeStore } from '../../core/programme/programme-store';
import { ConfirmService } from '../../core/ui/confirm.service';

@Component({
  selector: 'app-programme',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './programme.component.html',
  styleUrl: './programme.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgrammeComponent {
  protected readonly store = inject(ProgrammeStore);
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertsService);
  private readonly confirm = inject(ConfirmService);

  /** Upcoming deadlines (planned audits, permit expiries, complaint due dates) grouped by month for the timeline. */
  protected readonly schedule = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    const groups = new Map<string, { month: string; events: (ScheduleEvent & { overdue: boolean })[] }>();
    for (const event of this.alerts.scheduleEvents()) {
      const key = event.date.slice(0, 7);
      if (!groups.has(key)) {
        const label = new Date(`${event.date}T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });
        groups.set(key, { month: label, events: [] });
      }
      groups.get(key)!.events.push({ ...event, overdue: event.date < today });
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, value]) => value);
  });

  protected scheduleIcon(kind: ScheduleEvent['kind']): string {
    return kind === 'permit' ? 'event_available' : kind === 'complaint' ? 'feedback' : 'event';
  }

  protected readonly canEdit = computed(() => ['leadAuditor', 'tenantAdmin'].includes(this.auth.user()?.role ?? ''));
  protected readonly newType = signal<AuditTypeKind>('surveillance');

  protected readonly types: { value: AuditTypeKind; label: string }[] = [
    { value: 'internal', label: 'Internal' },
    { value: 'certificationStage1', label: 'Certification (stage 1)' },
    { value: 'certificationStage2', label: 'Certification (stage 2)' },
    { value: 'surveillance', label: 'Surveillance' },
    { value: 'recertification', label: 'Recertification' },
    { value: 'special', label: 'Special' },
  ];

  protected readonly statuses: PlannedStatus[] = ['planned', 'inProgress', 'completed', 'cancelled'];

  protected typeLabel(type: AuditTypeKind): string {
    return this.types.find((t) => t.value === type)?.label ?? type;
  }

  protected statusTone(status: PlannedStatus): 'positive' | 'progress' | 'critical' | 'neutral' {
    if (status === 'completed') return 'positive';
    if (status === 'cancelled') return 'critical';
    if (status === 'inProgress') return 'progress';
    return 'neutral';
  }

  protected addPlanned(): void {
    this.store.addPlannedAudit(this.newType(), this.suggestDue(this.newType()));
  }

  protected async confirmRemovePlanned(id: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove planned audit?',
      message: 'This planned audit will be removed from the programme. This cannot be undone.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removePlannedAudit(id);
  }

  protected async confirmRemoveCertificate(id: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove certificate?',
      message: 'This certificate record will be permanently removed.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeCertificate(id);
  }

  protected async confirmRemoveComplaint(id: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove record?',
      message: 'This complaint / appeal record will be permanently removed.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeComplaint(id);
  }

  protected suggestDue(type: AuditTypeKind): string {
    const now = new Date().toISOString();
    if (type === 'surveillance') return surveillanceDue(now).slice(0, 10);
    if (type === 'recertification') return recertificationDue(now).slice(0, 10);
    return now.slice(0, 10);
  }

  // --- Planning aids (IAF MD 5 audit time / MD 1 √N sampling) ---

  protected readonly complexities: AuditComplexity[] = ['high', 'medium', 'low', 'limited'];
  protected readonly stages: CertificationStage[] = ['initial', 'surveillance', 'recertification'];

  protected readonly auditTime = computed<AuditTimeResult | null>(() => {
    const planning = this.store.programme()?.planning;
    if (!planning?.effectivePersonnel) return null;
    return calculateAuditDuration({
      effectivePersonnel: planning.effectivePersonnel,
      complexity: planning.complexity ?? 'high',
      stage: planning.stage ?? 'initial',
    });
  });

  protected readonly siteSample = computed(() => {
    const planning = this.store.programme()?.planning;
    if (!planning?.siteCount || planning.siteCount < 1) return null;
    return sampleSiteCount(planning.siteCount, planning.stage ?? 'initial');
  });

  /** A demonstrative representative-spread rationale for the entered site count. */
  protected sampleRationale(): string {
    const planning = this.store.programme()?.planning;
    if (!planning?.siteCount || planning.siteCount < 1) return '';
    const labels = Array.from({ length: planning.siteCount }, (_unused, index) => `Site ${index + 1}`);
    return selectSampleSites(labels, planning.stage ?? 'initial').rationale;
  }

  // --- Certificates ---

  protected readonly certStatuses: CertificateStatus[] = ['active', 'suspended', 'reducedScope', 'withdrawn', 'expired'];

  protected certTransitions(status: CertificateStatus): CertificateStatus[] {
    return CERTIFICATE_TRANSITIONS[status] ?? [];
  }

  protected certTone(status: CertificateStatus): 'positive' | 'progress' | 'critical' | 'neutral' {
    if (status === 'active') return 'positive';
    if (status === 'suspended' || status === 'reducedScope') return 'progress';
    if (status === 'withdrawn' || status === 'expired') return 'critical';
    return 'neutral';
  }

  protected onCertTransition(cert: Certificate, value: string): void {
    if (!value) return;
    this.store.transitionCertificate(cert.id, value as CertificateStatus);
  }

  // --- Complaints & appeals ---

  protected readonly complaintStatuses: ComplaintStatus[] = [
    'received',
    'underReview',
    'resolved',
    'closed',
    'upheld',
    'rejected',
  ];
  protected readonly complaintKinds: ComplaintKind[] = ['complaint', 'appeal'];

  protected overdue(item: ComplaintAppeal): boolean {
    return isComplaintOverdue(item);
  }

  protected num(value: unknown): number | undefined {
    const text = String(value ?? '').trim();
    if (text === '') return undefined;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
