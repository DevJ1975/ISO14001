import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { computePortfolioAnalytics, type PortfolioAnalyticsInput, type PortfolioBucket } from '../../core/domain';
import { FieldAuditStore } from '../../core/field/field-audit-store';
import { ProgrammeStore } from '../../core/programme/programme-store';

interface Bar {
  label: string;
  count: number;
  pct: number;
  tone: 'critical' | 'progress' | 'positive' | 'neutral';
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  fieldwork: 'Fieldwork',
  reporting: 'Reporting',
  followup: 'Follow-up',
  closed: 'Closed',
  archived: 'Archived',
  unknown: 'Unspecified',
};

const TYPE_LABELS: Record<string, string> = {
  internal: 'Internal',
  stage1: 'Stage 1',
  stage2: 'Stage 2',
  certificationstage1: 'Stage 1',
  certificationstage2: 'Stage 2',
  surveillance: 'Surveillance',
  recertification: 'Recertification',
  special: 'Special',
  unknown: 'Unspecified',
};

/**
 * Portfolio analytics — a cross-audit overview that rolls metrics up ACROSS the
 * auditor's audits, distinct from the single-audit Overview dashboard. The
 * aggregation is delegated to the pure `computePortfolioAnalytics` domain
 * function; this component only reads the stores' signals into a plain input and
 * renders dependency-free CSS bars.
 *
 * Data scope (first iteration): audits-by-status and programme health span the
 * whole tenant (the audit list + the audit programme). Findings/CAPA breakdowns
 * are sourced from the active audit's detail, since the client only holds the
 * selected audit's findings — the pure function already accepts arrays per audit
 * so this generalises once a cross-audit findings endpoint exists.
 */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [MatIconModule, RouterLink],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent {
  protected readonly store = inject(FieldAuditStore);
  protected readonly programmeStore = inject(ProgrammeStore);

  /** Pure, deterministic rollup over whatever cross-audit data the client holds. */
  protected readonly analytics = computed(() => {
    const audits = this.store.audits();
    const activeType = this.store.reportMeta().auditType;
    const programme = this.programmeStore.programme();

    const input: PortfolioAnalyticsInput = {
      audits: audits.map((a) => ({
        id: a.id,
        status: a.status,
        // The active audit's type is known from its report meta; others fall back to unspecified.
        auditType: a.id === this.store.selectedAuditId() ? activeType : undefined,
      })),
      findings: this.store.findings().map((f) => ({
        clauseId: f.clauseId,
        type: f.type,
        status: f.status,
        createdAt: f.createdAt,
      })),
      capas: this.store.capas().map((c) => ({ dueDate: c.dueDate, status: c.status })),
      internalAudits: (programme?.internalAudits ?? []).map((a) => ({ status: a.status, plannedDate: a.plannedDate })),
      plannedAudits: (programme?.plannedAudits ?? []).map((p) => ({ status: p.status })),
    };
    return computePortfolioAnalytics(input);
  });

  /** Whether findings/CAPA figures cover the whole portfolio or just the active audit. */
  protected readonly findingsScopedToActive = computed(() => this.store.audits().length > 1);

  protected readonly auditsByStatus = computed<Bar[]>(() =>
    toBars(this.analytics().auditsByStatus, (key) => STATUS_LABELS[key] ?? key, () => 'progress'),
  );

  protected readonly auditsByType = computed<Bar[]>(() =>
    toBars(this.analytics().auditsByType, (key) => TYPE_LABELS[key] ?? key, () => 'neutral'),
  );

  protected readonly findingsMix = computed<Bar[]>(() => {
    const f = this.analytics().findings;
    return toBars(
      [
        { key: 'major', count: f.majorNc },
        { key: 'minor', count: f.minorNc },
        { key: 'ofi', count: f.ofi },
      ],
      (key) => (key === 'major' ? 'Major NC' : key === 'minor' ? 'Minor NC' : 'OFI'),
      (key) => (key === 'major' ? 'critical' : key === 'minor' ? 'progress' : 'neutral'),
    );
  });

  protected readonly capaMix = computed<Bar[]>(() => {
    const c = this.analytics().capas;
    return toBars(
      [
        { key: 'verified', count: c.verified },
        { key: 'open', count: c.open },
        { key: 'overdue', count: c.overdue },
      ],
      (key) => (key === 'verified' ? 'Verified' : key === 'open' ? 'In progress' : 'Overdue'),
      (key) => (key === 'verified' ? 'positive' : key === 'open' ? 'progress' : 'critical'),
    );
  });

  protected readonly findingsByClause = computed<Bar[]>(() =>
    toBars(
      this.analytics().findingsByClauseGroup,
      (key) => (key === 'other' ? 'Other' : `cl. ${key}`),
      () => 'critical',
    ),
  );

  protected readonly findingsByMonth = computed<Bar[]>(() =>
    toBars(this.analytics().findingsByMonth, (key) => key, () => 'progress'),
  );

  protected readonly programmeRate = computed(() => {
    const p = this.analytics().programme;
    return {
      ...p,
      plannedPct: p.plannedTotal ? Math.round((p.plannedCompleted / p.plannedTotal) * 100) : 0,
      internalPct: p.internalTotal ? Math.round((p.internalCompleted / p.internalTotal) * 100) : 0,
    };
  });
}

/** Convert labelled buckets into render-ready bars, scaled to the group's max count. */
function toBars(
  buckets: readonly PortfolioBucket[],
  label: (key: string) => string,
  tone: (key: string) => Bar['tone'],
): Bar[] {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return buckets.map((b) => ({
    label: label(b.key),
    count: b.count,
    pct: Math.round((b.count / max) * 100),
    tone: tone(b.key),
  }));
}
