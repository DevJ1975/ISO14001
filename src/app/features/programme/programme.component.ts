import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

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

@Component({
  selector: 'app-programme',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './programme.component.html',
  styleUrl: './programme.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgrammeComponent {
  protected readonly store = inject(ProgrammeStore);
  private readonly auth = inject(AuthService);

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
