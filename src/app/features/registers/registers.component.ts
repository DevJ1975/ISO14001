import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import {
  AspectSignificanceResult,
  ClauseGuide,
  CalibrationStatus,
  calibrationStatus,
  clauseGuideFor,
  DocumentReviewStatus,
  documentReviewStatus,
  evaluateAspectSignificance,
  metricVariance,
  carbonRollup,
  emissionTco2e,
  formatTco2e,
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
import { EnvironmentalAspect, FieldAuditStore, Permit, RegisterResult } from '../../core/field/field-audit-store';
import {
  calibrationColumns,
  carbonColumns,
  changeColumns,
  documentColumns,
  incidentColumns,
  permitColumns,
  supplierColumns,
  trainingColumns,
} from './registers-export';

type Tab =
  | 'aspects'
  | 'risks'
  | 'compliance'
  | 'objectives'
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
  | 'calibration'
  | 'training'
  | 'suppliers'
  | 'changes'
  | 'carbon'
  | 'review';
type Tone = 'positive' | 'progress' | 'critical' | 'neutral';

@Component({
  selector: 'app-registers',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './registers.component.html',
  styleUrl: './registers.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistersComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly csv = inject(CsvExportService);
  protected readonly tab = signal<Tab>('aspects');
  protected readonly hintsOpen = signal(false);

  /** Each register maps to the ISO 14001 clause it evaluates, for contextual field-guide help. */
  private readonly tabClause: Record<Tab, string> = {
    aspects: '6.1.2',
    risks: '6.1',
    compliance: '6.1.3',
    objectives: '6.2',
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
    calibration: '9.1',
    training: '7.2',
    suppliers: '8.1',
    changes: '8.1',
    carbon: '9.1',
    review: '9.3',
  };

  /** Field-guide entry ("what to look for") for the active register's clause. */
  protected readonly guide = computed<ClauseGuide | undefined>(() => clauseGuideFor(this.tabClause[this.tab()]));

  protected readonly tabs: { value: Tab; label: string; icon: string }[] = [
    { value: 'aspects', label: 'Aspects', icon: 'eco' },
    { value: 'risks', label: 'Risks/opps', icon: 'balance' },
    { value: 'compliance', label: 'Compliance', icon: 'gavel' },
    { value: 'objectives', label: 'Objectives', icon: 'flag_circle' },
    { value: 'resources', label: 'Resources', icon: 'inventory_2' },
    { value: 'competence', label: 'Competence', icon: 'school' },
    { value: 'awareness', label: 'Awareness', icon: 'campaign' },
    { value: 'communication', label: 'Comms', icon: 'forum' },
    { value: 'documents', label: 'Documents', icon: 'description' },
    { value: 'emergency', label: 'Emergency', icon: 'emergency' },
    { value: 'parties', label: 'Parties', icon: 'groups' },
    { value: 'performance', label: 'Performance', icon: 'monitoring' },
    { value: 'permits', label: 'Permits', icon: 'event_available' },
    { value: 'incidents', label: 'Incidents', icon: 'report' },
    { value: 'calibration', label: 'Calibration', icon: 'straighten' },
    { value: 'training', label: 'Training', icon: 'workspace_premium' },
    { value: 'suppliers', label: 'Suppliers', icon: 'local_shipping' },
    { value: 'changes', label: 'Change (MoC)', icon: 'published_with_changes' },
    { value: 'carbon', label: 'Carbon', icon: 'co2' },
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
   * Resolve the active tab to a CSV export spec (label + rows + columns), or null
   * for registers without a structured exporter. Keeps the template a single call.
   */
  private exportSpec(): { label: string; rows: readonly unknown[]; columns: readonly { header: string; value: (row: never) => unknown }[] } | null {
    switch (this.tab()) {
      case 'calibration':
        return { label: 'Calibration register', rows: this.store.calibration(), columns: calibrationColumns };
      case 'training':
        return { label: 'Training matrix', rows: this.store.training(), columns: trainingColumns };
      case 'suppliers':
        return { label: 'Supplier evaluation', rows: this.store.suppliers(), columns: supplierColumns };
      case 'changes':
        return { label: 'Management of change', rows: this.store.changes(), columns: changeColumns };
      case 'carbon':
        return { label: 'Carbon inventory', rows: this.store.carbon(), columns: carbonColumns };
      case 'incidents':
        return { label: 'Incident register', rows: this.store.incidents(), columns: incidentColumns };
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

  /** Suggested significance band/score from the aspect's scored criteria (cl. 6.1.2). */
  protected aspectSignificance(aspect: EnvironmentalAspect): AspectSignificanceResult {
    return evaluateAspectSignificance({
      severity: aspect.severityScore,
      likelihood: aspect.likelihoodScore,
      legalConcern: aspect.legalConcern,
      stakeholderConcern: aspect.stakeholderConcern,
    });
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

  /** Per-scope carbon rollup (tCO2e) for the inventory summary. */
  protected readonly carbon = computed(() => carbonRollup(this.store.carbon()));

  /** Computed tCO2e for a single inventory row (override or activity × factor ÷ 1000). */
  protected rowTco2e(entry: { activityData?: number; emissionFactor?: number; tco2eOverride?: number }): string {
    return formatTco2e(emissionTco2e(entry));
  }

  protected readonly fmtTco2e = formatTco2e;

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
