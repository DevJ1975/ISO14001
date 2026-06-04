import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  RiskRatingResult,
  ClauseGuide,
  CalibrationStatus,
  calibrationStatus,
  clauseGuideFor,
  DocumentReviewStatus,
  documentReviewStatus,
  evaluateRiskRating,
  metricVariance,
  MocAttention,
  mocAttention,
  PermitExpiryStatus,
  permitExpiryStatus,
  SupplierEvaluationStatus,
  supplierEvaluationStatus,
  TrainingStatus,
  trainingStatus,
} from '../../core/domain';
import { CsvExportService } from '../../core/export/csv-export.service';
import { ComplianceEvaluation, ContextItem, Hazard, FieldAuditStore, HiraEntry, LeadershipItem, OperationalControl, Permit, RegisterResult } from '../../core/field/field-audit-store';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import {
  calibrationColumns,
  changeColumns,
  consultationColumns,
  contextColumns,
  documentColumns,
  hazardColumns,
  hiraColumns,
  incidentColumns,
  leadershipColumns,
  operationalControlColumns,
  permitColumns,
  supplierColumns,
  trainingColumns,
} from './registers-export';

type Tab =
  | 'aspects'
  | 'risks'
  | 'compliance'
  | 'objectives'
  | 'consultation'
  | 'resources'
  | 'competence'
  | 'awareness'
  | 'communication'
  | 'documents'
  | 'emergency'
  | 'parties'
  | 'performance'
  | 'permits'
  | 'incidents'
  | 'hira'
  | 'calibration'
  | 'training'
  | 'suppliers'
  | 'changes'
  | 'opcontrols'
  | 'leadership'
  | 'context'
  | 'review';
type Tone = 'positive' | 'progress' | 'critical' | 'neutral';

@Component({
  selector: 'app-registers',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './registers.component.html',
  styleUrl: './registers.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistersComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly csv = inject(CsvExportService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private savedTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly tab = signal<Tab>('aspects');
  protected readonly hintsOpen = signal(false);
  /** URL fragment (e.g. #permits) → open that register tab on deep-link from dashboards/alerts. */
  private readonly fragment = toSignal(this.route.fragment);

  constructor() {
    effect(() => {
      const fragment = this.fragment();
      if (fragment && this.isTab(fragment)) this.tab.set(fragment);
    });
  }

  private isTab(value: string): value is Tab {
    return this.tabs.some((entry) => entry.value === value);
  }

  /** Each register maps to the ISO 45001 clause it evaluates, for contextual field-guide help. */
  private readonly tabClause: Record<Tab, string> = {
    aspects: '6.1.2',
    risks: '6.1',
    compliance: '6.1.3',
    objectives: '6.2',
    consultation: '5.4',
    resources: '7.1',
    competence: '7.2',
    awareness: '7.3',
    communication: '7.4',
    documents: '7.5',
    emergency: '8.2',
    parties: '4.2',
    performance: '9.1',
    permits: '6.1.3',
    incidents: '10.2',
    hira: '6.1.2',
    calibration: '9.1',
    training: '7.2',
    suppliers: '8.1.4',
    changes: '8.1.3',
    opcontrols: '8.1.2',
    leadership: '5.1',
    context: '4.1',
    review: '9.3',
  };

  /** Field-guide entry ("what to look for") for the active register's clause. */
  protected readonly guide = computed<ClauseGuide | undefined>(() => clauseGuideFor(this.tabClause[this.tab()]));

  protected readonly tabs: { value: Tab; label: string; icon: string }[] = [
    { value: 'aspects', label: 'Hazards & risk', icon: 'health_and_safety' },
    { value: 'risks', label: 'Risks/opps', icon: 'balance' },
    { value: 'compliance', label: 'Legal & other', icon: 'gavel' },
    { value: 'objectives', label: 'Objectives', icon: 'flag_circle' },
    { value: 'consultation', label: 'Consultation', icon: 'groups' },
    { value: 'resources', label: 'Resources', icon: 'inventory_2' },
    { value: 'competence', label: 'Competence', icon: 'school' },
    { value: 'awareness', label: 'Awareness', icon: 'campaign' },
    { value: 'communication', label: 'Comms', icon: 'forum' },
    { value: 'documents', label: 'Documents', icon: 'description' },
    { value: 'emergency', label: 'Emergency', icon: 'emergency' },
    { value: 'parties', label: 'Parties', icon: 'diversity_3' },
    { value: 'performance', label: 'Performance', icon: 'monitoring' },
    { value: 'permits', label: 'Permits', icon: 'event_available' },
    { value: 'incidents', label: 'Incidents', icon: 'personal_injury' },
    { value: 'hira', label: 'HIRA (6.1.2)', icon: 'warning' },
    { value: 'calibration', label: 'Calibration', icon: 'straighten' },
    { value: 'training', label: 'Training', icon: 'workspace_premium' },
    { value: 'suppliers', label: 'Contractors', icon: 'engineering' },
    { value: 'changes', label: 'Change (MoC)', icon: 'published_with_changes' },
    { value: 'opcontrols', label: 'Operational controls', icon: 'rule' },
    { value: 'leadership', label: 'Leadership & policy', icon: 'supervisor_account' },
    { value: 'context', label: 'Context & scope', icon: 'travel_explore' },
    { value: 'review', label: 'Mgmt review', icon: 'fact_check' },
  ];

  protected readonly results: { value: RegisterResult; label: string; tone: Tone }[] = [
    { value: 'conforming', label: 'Conform', tone: 'positive' },
    { value: 'nonconforming', label: 'Nonconform', tone: 'critical' },
    { value: 'needsFollowUp', label: 'Follow-up', tone: 'progress' },
    { value: 'notApplicable', label: 'N/A', tone: 'neutral' },
  ];

  protected setTab(value: Tab): void {
    this.tab.set(value);
  }

  /**
   * Confirm an edit landed. Register fields autosave through the store on every
   * `(change)`; a single delegated listener on the screen catches them all
   * (change bubbles) so we don't touch ~100 inline bindings. Debounced so a
   * burst of edits coalesces into one "Saved".
   */
  protected onRegisterEdit(): void {
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => {
      this.savedTimer = null;
      this.toast.saved();
    }, 700);
  }

  /** Confirm before removing a document attachment (destructive, no undo). */
  protected async confirmRemoveAttachment(rowId: string, attachmentId: string, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove attachment?',
      message: `"${name}" will be removed from this document record.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeDocumentAttachment(rowId, attachmentId);
  }

  /** Confirm before removing a HIRA row (destructive, no undo). */
  protected async confirmRemoveHira(row: HiraEntry): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove HIRA row?',
      message: `"${row.hazard || row.activity || 'This hazard'}" will be removed from the register.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeHira(row.id);
  }

  /** Confirm before removing an operational-control row (destructive, no undo). */
  protected async confirmRemoveOperationalControl(row: OperationalControl): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove operational control?',
      message: `"${row.activity || 'This control'}" will be removed from the register.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeOperationalControl(row.id);
  }

  /** Confirm before removing a leadership & policy row (destructive, no undo). */
  protected async confirmRemoveLeadership(row: LeadershipItem): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove leadership & policy row?',
      message: `"${row.label || 'This row'}" will be removed from the register.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeLeadershipItem(row.id);
  }

  /** Leadership & policy rows for one group, in seed order (cl. 5.1 / 5.2 / 5.3). */
  protected leadershipByKind(kind: LeadershipItem['kind']): LeadershipItem[] {
    return this.store.leadership().filter((row) => row.kind === kind);
  }

  /** Confirm before removing a context & scope row (destructive, no undo). */
  protected async confirmRemoveContext(row: ContextItem): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove context & scope row?',
      message: `"${row.label || 'This row'}" will be removed from the register.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.store.removeContextItem(row.id);
  }

  /** Context & scope rows for one group, in seed order (cl. 4.1 / 4.2 / 4.3). */
  protected contextByKind(kind: ContextItem['kind']): ContextItem[] {
    return this.store.context().filter((row) => row.kind === kind);
  }

  /**
   * Resolve the active tab to a CSV export spec (label + rows + columns), or null
   * for registers without a structured exporter. Keeps the template a single call.
   */
  private exportSpec(): { label: string; rows: readonly unknown[]; columns: readonly { header: string; value: (row: never) => unknown }[] } | null {
    switch (this.tab()) {
      case 'aspects':
        return { label: 'Hazard & risk register', rows: this.store.aspects(), columns: hazardColumns };
      case 'consultation':
        return { label: 'Worker consultation register', rows: this.store.workerConsultations(), columns: consultationColumns };
      case 'calibration':
        return { label: 'Calibration register', rows: this.store.calibration(), columns: calibrationColumns };
      case 'training':
        return { label: 'Training matrix', rows: this.store.training(), columns: trainingColumns };
      case 'suppliers':
        return { label: 'Contractor evaluation', rows: this.store.suppliers(), columns: supplierColumns };
      case 'changes':
        return { label: 'Management of change', rows: this.store.changes(), columns: changeColumns };
      case 'opcontrols':
        return { label: 'Operational controls register', rows: this.store.operationalControls(), columns: operationalControlColumns };
      case 'leadership':
        return { label: 'Leadership & policy register', rows: this.store.leadership(), columns: leadershipColumns };
      case 'context':
        return { label: 'Context & scope register', rows: this.store.context(), columns: contextColumns };
      case 'incidents':
        return { label: 'Incident register', rows: this.store.incidents(), columns: incidentColumns };
      case 'hira':
        return { label: 'HIRA register', rows: this.store.hira(), columns: hiraColumns };
      case 'permits':
        return { label: 'Permit register', rows: this.store.permits(), columns: permitColumns };
      case 'documents':
        return { label: 'Document register', rows: this.store.documentedInfo(), columns: documentColumns };
      default:
        return null;
    }
  }

  /** True when the active register has a CSV exporter and at least one row. */
  protected canExport(): boolean {
    const spec = this.exportSpec();
    return !!spec && spec.rows.length > 0;
  }

  /** Download the active register as a CSV file (client-side, offline-capable). */
  protected exportCsv(): void {
    const spec = this.exportSpec();
    if (!spec) return;
    this.csv.download(spec.label, spec.rows as never[], spec.columns as never);
  }

  protected toggleHints(): void {
    this.hintsOpen.update((open) => !open);
  }

  protected resultTone(result: RegisterResult): Tone {
    if (result === 'conforming') return 'positive';
    if (result === 'nonconforming') return 'critical';
    if (result === 'needsFollowUp') return 'progress';
    return 'neutral';
  }

  /** Human-readable label for a compliance status (cl. 9.1.2 evaluation history). */
  protected complianceLabel(status: ComplianceEvaluation['complianceStatus']): string {
    if (status === 'compliant') return 'Compliant';
    if (status === 'nonCompliant') return 'Non-compliant';
    return 'To verify';
  }

  /** Badge tone for a compliance status. */
  protected complianceTone(status: ComplianceEvaluation['complianceStatus']): Tone {
    if (status === 'compliant') return 'positive';
    if (status === 'nonCompliant') return 'critical';
    return 'progress';
  }

  /**
   * Record a timestamped compliance evaluation for an obligation (cl. 9.1.2),
   * then clear the note input for the next entry.
   */
  protected recordEvaluation(obligationId: string, status: string, noteInput: HTMLInputElement): void {
    this.store.addComplianceEvaluation(obligationId, {
      complianceStatus: status as ComplianceEvaluation['complianceStatus'],
      note: noteInput.value,
    });
    noteInput.value = '';
  }

  /** Suggested OH&S risk band/score from the hazard's scored criteria (cl. 6.1.2). */
  protected aspectSignificance(aspect: Hazard): RiskRatingResult {
    return evaluateRiskRating({
      severity: aspect.severityScore,
      likelihood: aspect.likelihoodScore,
      legalConcern: aspect.legalConcern,
      workerConcern: aspect.stakeholderConcern,
    });
  }

  /** HIRA initial risk band/score from severity × likelihood (cl. 6.1.2). */
  protected hiraInitialBand(row: HiraEntry): RiskRatingResult {
    return evaluateRiskRating({ severity: row.severity, likelihood: row.likelihood });
  }

  /** HIRA residual risk band/score once additional controls are applied (cl. 6.1.2 / 8.1.2). */
  protected hiraResidualBand(row: HiraEntry): RiskRatingResult {
    return evaluateRiskRating({ severity: row.residualSeverity, likelihood: row.residualLikelihood });
  }

  /** Permit renewal status (valid / expiring soon / expired) for badge display. */
  protected permitStatus(permit: Permit): PermitExpiryStatus {
    return permitExpiryStatus(permit);
  }

  /** Calibration status (valid / due soon / overdue / out of service) for badge display. */
  protected calibrationBadge(record: { nextDueAt?: string; outOfService?: boolean }): CalibrationStatus {
    return calibrationStatus(record);
  }

  /** Training status (current / due soon / expired / not trained) for badge display. */
  protected trainingBadge(record: { completedAt?: string; expiresAt?: string }): TrainingStatus {
    return trainingStatus(record);
  }

  /** Supplier evaluation status (current / due soon / overdue / not evaluated / not relevant) for badge display. */
  protected supplierBadge(record: {
    environmentallyRelevant?: boolean;
    lastEvaluatedAt?: string;
    nextEvaluationAt?: string;
  }): SupplierEvaluationStatus {
    return supplierEvaluationStatus(record);
  }

  /** Management-of-change attention (on-track / overdue / aspects-outstanding / settled) for badge display. */
  protected changeBadge(record: {
    status?: 'proposed' | 'assessing' | 'approved' | 'implemented' | 'closed' | 'rejected';
    aspectsReviewed?: boolean;
    targetDate?: string;
  }): MocAttention {
    return mocAttention(record);
  }

  /** Document review status (current / due soon / overdue / no date) for badge display. */
  protected documentBadge(record: { nextReviewAt?: string }): DocumentReviewStatus {
    return documentReviewStatus(record);
  }

  /** Attach a picked file to a controlled document, then reset the input. */
  protected onDocumentFile(docId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.store.addDocumentAttachment(docId, file);
    input.value = '';
  }

  /** Open a document attachment in a new tab (resolves the local blob URL). */
  protected async openAttachment(blobKey: string | undefined): Promise<void> {
    const url = await this.store.resolveAttachmentUrl(blobKey);
    if (url && typeof window !== 'undefined') window.open(url, '_blank');
  }

  /** Count of permits expiring soon or already expired, for the register alert. */
  protected expiringPermits(): number {
    return this.store.permits().filter((p) => {
      const status = permitExpiryStatus(p);
      return status === 'expiringSoon' || status === 'expired';
    }).length;
  }

  /** Parse a numeric input, treating blank as "not recorded" (undefined). */
  protected num(value: unknown): number | undefined {
    const text = String(value ?? '').trim();
    if (text === '') return undefined;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /** Human-readable actual-vs-target variance for a performance metric. */
  protected variance(metric: { actualValue?: number; targetValue?: number }): string {
    const v = metricVariance(metric);
    if (!v) return '—';
    const sign = v.absolute > 0 ? '+' : '';
    const abs = Math.round(v.absolute * 100) / 100;
    return v.percent == null ? `${sign}${abs}` : `${sign}${abs} (${sign}${v.percent}%)`;
  }
}
