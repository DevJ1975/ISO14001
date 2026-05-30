import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Location } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import {
  FieldAuditStore,
  type FieldCapa,
  type FieldFinding,
  type Recommendation,
} from '../../core/field/field-audit-store';

const RESULT_LABELS: Record<string, string> = {
  conform: 'Conform',
  minorNc: 'Minor NC',
  majorNc: 'Major NC',
  ofi: 'OFI',
  notApplicable: 'N/A',
  notStarted: 'Not started',
  conforming: 'Conforming',
  nonconforming: 'Nonconforming',
  needsFollowUp: 'Needs follow-up',
};

const FINDING_LABELS: Record<string, string> = {
  majorNc: 'Major nonconformity',
  minorNc: 'Minor nonconformity',
  ofi: 'Opportunity for improvement',
  conformity: 'Conformity',
};

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  recommend: 'Recommend certification',
  conditional: 'Conditional — pending corrective action',
  notRecommended: 'Not recommended',
  satisfactory: 'Satisfactory',
  actionRequired: 'Action required',
};

/**
 * Print-optimized ISO 14001 audit report. Rendered on its own route; the app
 * shell is hidden via `@media print` so the browser's native "Save as PDF"
 * produces a clean, paginated document — no PDF library required.
 */
@Component({
  selector: 'app-report-print',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './report-print.component.html',
  styleUrl: './report-print.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportPrintComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);

  protected readonly generatedAt = new Date().toISOString();
  protected readonly preparedBy = computed(() => this.auth.user()?.displayName || 'Lead auditor');

  protected readonly nonconformities = computed(() =>
    this.store.findings().filter((f) => f.type === 'majorNc' || f.type === 'minorNc'),
  );
  protected readonly opportunities = computed(() => this.store.findings().filter((f) => f.type === 'ofi'));

  protected resultLabel(value: string): string {
    return RESULT_LABELS[value] ?? value;
  }

  protected findingLabel(type: string): string {
    return FINDING_LABELS[type] ?? type;
  }

  protected recommendationLabel(value: Recommendation | undefined): string {
    return value ? RECOMMENDATION_LABELS[value] : '—';
  }

  protected capaFor(finding: FieldFinding): FieldCapa | undefined {
    return this.store.capas().find((c) => c.findingId === finding.id);
  }

  protected formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString([], { dateStyle: 'medium' });
  }

  protected formatDateTime(iso: string | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected print(): void {
    window.print();
  }

  protected back(): void {
    this.location.back();
  }
}
