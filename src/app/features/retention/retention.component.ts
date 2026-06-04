import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import {
  computeRetention,
  type RetentionDisposition,
  type RetentionInput,
  type RetentionRecord,
} from '../../core/domain';
import { FieldAuditStore } from '../../core/field/field-audit-store';
import { RetentionPolicyService } from '../../core/retention/retention-policy.service';

const DISPOSITION_LABELS: Record<RetentionDisposition, string> = {
  active: 'Active',
  dueForReview: 'Due for review',
  eligibleForDisposal: 'Eligible for disposal',
  onLegalHold: 'On legal hold',
};

const DISPOSITION_TONE: Record<RetentionDisposition, 'positive' | 'progress' | 'critical' | 'neutral'> = {
  active: 'positive',
  dueForReview: 'progress',
  eligibleForDisposal: 'critical',
  onLegalHold: 'neutral',
};

/**
 * Records retention & legal-hold policy — a client-side data-governance view for
 * the current audit. The retention math is delegated to the pure
 * `computeRetention` domain function; this component only reads the store's base
 * date and the persisted overrides into a plain input and renders the result.
 *
 * Base date precedence: report sign-off date → audit end date → audit creation
 * date. Legal holds and any period overrides persist in localStorage via
 * `RetentionPolicyService` (no backend route this iteration — see service note).
 */
@Component({
  selector: 'app-retention',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './retention.component.html',
  styleUrl: './retention.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionComponent {
  protected readonly store = inject(FieldAuditStore);
  protected readonly policy = inject(RetentionPolicyService);

  /** The audit/report date retention is measured from, or null when unknown. */
  protected readonly baseDate = computed<string | null>(() => {
    const signed = this.store.reportSignedAt();
    if (signed) return signed;
    const audit = this.store.audits().find((a) => a.id === this.store.selectedAuditId());
    return audit?.endsAt ?? audit?.startsAt ?? audit?.createdAt ?? null;
  });

  protected readonly summary = computed(() => {
    const input: RetentionInput = {
      baseDate: this.baseDate() ?? undefined,
      overrides: this.policy.overrides(),
    };
    return computeRetention(input);
  });

  protected readonly records = computed(() => this.summary().records);

  protected dispositionLabel(d: RetentionDisposition): string {
    return DISPOSITION_LABELS[d];
  }

  protected dispositionTone(d: RetentionDisposition): string {
    return DISPOSITION_TONE[d];
  }

  protected formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  protected remainingLabel(record: RetentionRecord): string {
    if (record.daysRemaining === null) return 'date unknown';
    const days = record.daysRemaining;
    if (days < 0) return `${Math.abs(days)} day(s) past retain-until`;
    if (days === 0) return 'retain-until is today';
    return `${days} day(s) remaining`;
  }

  protected toggleHold(record: RetentionRecord): void {
    this.policy.toggleLegalHold(record.id);
  }
}
