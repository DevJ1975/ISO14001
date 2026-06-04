import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { buildWorkingPapers, shortFingerprint, verifyReportSignature, workingPapersFindingRows } from '../../core/domain';
import { AuthService } from '../../core/auth/auth.service';
import { WorkingPapersExportService } from '../../core/export/working-papers-export.service';
import { AuditType, FieldAuditStore, Recommendation } from '../../core/field/field-audit-store';
import { ToastService } from '../../core/ui/toast.service';

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
  private readonly toast = inject(ToastService);
  private readonly workingPapers = inject(WorkingPapersExportService);

  protected readonly isLead = computed(() => this.auth.user()?.role === 'leadAuditor');
  /** Any auditor-side role may export the working-papers archive (not the auditee portal). */
  protected readonly isAuditor = this.auth.isAuditor;
  protected readonly conclusion = computed(() => this.store.conclusion());
  protected readonly signError = signal<string | null>(null);
  protected readonly generating = signal(false);
  protected readonly draftInfo = this.store.reportDraftInfo;

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
    this.toast.saved('Report saved');
  }

  protected saveOverall(text: string): void {
    if (!this.saveConclusionField('overallConformity', text)) return;
    this.toast.saved('Report saved');
  }

  protected saveOpinion(text: string): void {
    if (!this.saveConclusionField('emsEffectivenessOpinion', text)) return;
    this.toast.saved('Report saved');
  }

  protected saveCriteria(text: string): void {
    if (!this.saveConclusionField('criteriaMetStatement', text)) return;
    this.toast.saved('Report saved');
  }

  protected saveDiverging(text: string): void {
    if (!this.saveConclusionField('divergingOpinions', text)) return;
    this.toast.saved('Report saved');
  }

  /** Persist one conclusion text field; returns false (no-op) if unchanged. */
  private saveConclusionField(
    field: 'overallConformity' | 'emsEffectivenessOpinion' | 'criteriaMetStatement' | 'divergingOpinions',
    text: string,
  ): boolean {
    const next = text.trim();
    if (next === (this.conclusion()?.[field] ?? '')) return false;
    this.store.saveConclusion({ [field]: next });
    return true;
  }

  /** Auto-draft the conclusions from the audit data (AI when live, rule-based offline). */
  protected async generateDraft(): Promise<void> {
    this.generating.set(true);
    try {
      await this.store.generateReportDraft();
      this.toast.saved('Draft generated');
    } finally {
      this.generating.set(false);
    }
  }

  protected recommendationLabel(value: Recommendation): string {
    return this.recommendations.find((r) => r.value === value)?.label ?? value;
  }

  protected setAuditType(value: AuditType): void {
    this.store.updateReportMeta({ auditType: value });
    this.toast.saved('Report saved');
  }

  protected saveMeta(patch: Parameters<FieldAuditStore['updateReportMeta']>[0]): void {
    const meta = this.meta();
    const changed = Object.entries(patch).some(([key, value]) => meta[key as keyof typeof meta] !== value);
    if (!changed) return;
    this.store.updateReportMeta(patch);
    this.toast.saved('Report saved');
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

  /**
   * Gather the audit's data from the store, build the self-contained
   * working-papers pack and download it as JSON (plus a flat findings CSV).
   * Evidence metadata only — never the photo blobs.
   */
  protected exportWorkingPapers(): void {
    const store = this.store;
    const sig = this.signature();
    const pack = buildWorkingPapers({
      auditee: store.auditee(),
      criteria: store.criteria(),
      reportMeta: store.reportMeta(),
      status: store.auditStatus(),
      signedAt: store.reportSignedAt(),
      signatureFingerprint: sig ? shortFingerprint(sig.contentHash) : null,
      items: store.items(),
      findings: store.findings(),
      capas: store.capas(),
      evidence: store.evidence(),
      evidenceRequests: store.evidenceRequests(),
      meetings: store.meetings(),
      conclusion: store.conclusion(),
      changeLog: store.changeLog(),
      registers: {
        aspects: store.aspects(),
        obligations: store.obligations(),
        emergencyRecords: store.emergencyRecords(),
        interestedParties: store.interestedParties(),
        objectives: store.objectives(),
        communications: store.communications(),
        managementReviews: store.managementReviews(),
        workerConsultations: store.workerConsultations(),
        risksOpportunities: store.risksOpportunities(),
        resources: store.resources(),
        competence: store.competence(),
        workers: store.workers(),
        sites: store.sites(),
        awareness: store.awareness(),
        documentedInfo: store.documentedInfo(),
        performanceMetrics: store.performanceMetrics(),
        permits: store.permits(),
        incidents: store.incidents(),
        hira: store.hira(),
        calibration: store.calibration(),
        training: store.training(),
        suppliers: store.suppliers(),
        changes: store.changes(),
      },
    });
    const auditee = store.auditee();
    this.workingPapers.download(pack, auditee);
    if (pack.findings.length) {
      this.workingPapers.csvExport.download(`${auditee} working papers findings`, workingPapersFindingRows(pack), [
        { header: 'Clause', value: (r) => r.clauseId },
        { header: 'Clause title', value: (r) => r.clauseTitle },
        { header: 'Grade', value: (r) => r.type },
        { header: 'Status', value: (r) => r.status },
        { header: 'Finding', value: (r) => r.description },
        { header: 'Systemic', value: (r) => r.systemic },
        { header: 'Evidence items', value: (r) => r.evidenceCount },
        { header: 'Raised by', value: (r) => r.createdByName },
        { header: 'Raised at', value: (r) => r.createdAt },
      ]);
    }
    this.toast.saved('Working papers exported');
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
