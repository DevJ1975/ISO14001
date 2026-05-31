import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { shortFingerprint, verifyReportSignature } from '../../core/domain';
import { AuthService } from '../../core/auth/auth.service';
import { AuditType, FieldAuditStore, Recommendation } from '../../core/field/field-audit-store';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './report.component.html',
  styleUrl: './report.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly auth = inject(AuthService);

  protected readonly isLead = computed(() => this.auth.user()?.role === 'leadAuditor');
  protected readonly conclusion = computed(() => this.store.conclusion());
  protected readonly signError = signal<string | null>(null);

  protected readonly meta = this.store.reportMeta;

  protected readonly auditTypes: { value: AuditType; label: string }[] = [
    { value: 'stage1', label: 'Stage 1' },
    { value: 'stage2', label: 'Stage 2' },
    { value: 'surveillance', label: 'Surveillance' },
    { value: 'recertification', label: 'Recertification' },
    { value: 'internal', label: 'Internal' },
  ];

  protected readonly recommendations: { value: Recommendation; label: string }[] = [
    { value: 'recommend', label: 'Recommend' },
    { value: 'conditional', label: 'Conditional' },
    { value: 'notRecommended', label: 'Not recommended' },
    { value: 'satisfactory', label: 'Satisfactory' },
    { value: 'actionRequired', label: 'Action required' },
  ];

  protected readonly checks = computed(() => {
    const progress = this.store.progress();
    const findings = this.store.findings();
    const ncs = findings.filter((f) => f.type === 'minorNc' || f.type === 'majorNc');
    const allAnswered = progress.total > 0 && progress.done === progress.total;
    const ncsResolved = ncs.length === 0 || ncs.every((f) => f.status === 'closed' || f.status === 'verified');
    const hasEvidence = this.store.evidence().length > 0;
    const synced = this.store.outboxCount() === 0;
    return [
      { label: 'All clauses answered', ok: allAnswered, detail: `${progress.done}/${progress.total}` },
      { label: 'Nonconformities closed', ok: ncsResolved, detail: `${ncs.length} NC(s)` },
      { label: 'Evidence captured', ok: hasEvidence, detail: `${this.store.evidence().length} items` },
      { label: 'Changes synced', ok: synced, detail: `${this.store.outboxCount()} pending` },
    ];
  });

  protected readonly ready = computed(() => this.checks().every((check) => check.ok));

  protected setRecommendation(recommendation: Recommendation): void {
    this.store.saveConclusion({ recommendation });
  }

  protected saveOverall(text: string): void {
    this.store.saveConclusion({ overallConformity: text.trim() });
  }

  protected saveOpinion(text: string): void {
    this.store.saveConclusion({ emsEffectivenessOpinion: text.trim() });
  }

  protected saveCriteria(text: string): void {
    this.store.saveConclusion({ criteriaMetStatement: text.trim() });
  }

  protected saveDiverging(text: string): void {
    this.store.saveConclusion({ divergingOpinions: text.trim() });
  }

  protected recommendationLabel(value: Recommendation): string {
    return this.recommendations.find((r) => r.value === value)?.label ?? value;
  }

  protected setAuditType(value: AuditType): void {
    this.store.updateReportMeta({ auditType: value });
  }

  protected saveMeta(patch: Parameters<FieldAuditStore['updateReportMeta']>[0]): void {
    this.store.updateReportMeta(patch);
  }

  protected async sign(attestation: string): Promise<void> {
    this.signError.set(null);
    if (attestation.trim().length < 20) {
      this.signError.set('The attestation must be at least 20 characters.');
      return;
    }
    const user = this.auth.user();
    const signer = {
      uid: user?.uid ?? 'guest',
      name: user?.displayName || 'Lead auditor',
      role: user?.role ?? 'leadAuditor',
    };
    const ok = await this.store.signOff(attestation.trim(), signer);
    if (!ok) {
      this.signError.set('Sign-off failed. Check your connection and lead-auditor permission.');
    }
  }

  protected readonly signature = this.store.reportSignature;
  protected readonly fingerprint = computed(() => {
    const sig = this.signature();
    return sig ? shortFingerprint(sig.contentHash) : null;
  });

  /** Verify the signature against the current report content (detects post-sign edits). */
  protected readonly verifyState = signal<'idle' | 'valid' | 'tampered' | 'checking'>('idle');
  protected async verify(): Promise<void> {
    const sig = this.signature();
    if (!sig) return;
    this.verifyState.set('checking');
    const ok = await verifyReportSignature(sig, this.store.signableReport());
    this.verifyState.set(ok ? 'valid' : 'tampered');
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
