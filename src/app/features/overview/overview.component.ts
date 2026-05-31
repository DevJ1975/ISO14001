import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { AlertsService } from '../../core/alerts/alerts.service';
import { carbonRollup, formatTco2e, metricVariance } from '../../core/domain';
import { FieldAuditStore } from '../../core/field/field-audit-store';

interface Bar {
  label: string;
  count: number;
  pct: number;
  tone: 'critical' | 'progress' | 'positive' | 'neutral';
}

/**
 * Auditor overview dashboard — live KPIs and trend/breakdown charts over the
 * current audit, replacing the developer phase-showcase as the landing screen.
 * Pure computed views over the field-audit store (no backend); the visual style
 * is dependency-free CSS bars.
 */
@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent {
  protected readonly store = inject(FieldAuditStore);
  protected readonly alertsService = inject(AlertsService);

  protected readonly topAlerts = computed(() => this.alertsService.alerts().slice(0, 6));
  protected readonly alertCounts = this.alertsService.counts;
  protected readonly axis = [1, 2, 3, 4, 5];

  private readonly ncs = computed(() =>
    this.store.findings().filter((f) => f.type === 'majorNc' || f.type === 'minorNc'),
  );

  protected readonly kpis = computed(() => {
    const findings = this.store.findings();
    const capas = this.store.capas();
    const now = Date.now();
    return {
      progress: this.store.progress(),
      major: findings.filter((f) => f.type === 'majorNc').length,
      minor: findings.filter((f) => f.type === 'minorNc').length,
      ofi: findings.filter((f) => f.type === 'ofi').length,
      openNc: this.ncs().filter((f) => f.status !== 'closed').length,
      capaOverdue: capas.filter((c) => c.dueDate && c.status !== 'verified' && new Date(c.dueDate).getTime() < now).length,
      capaVerified: capas.filter((c) => c.status === 'verified').length,
      evidence: this.store.evidence().length,
      incidentsOpen: this.store.incidents().filter((i) => i.status !== 'closed').length,
    };
  });

  /** Nonconformities grouped by clause — the recurring-issue trend view. */
  protected readonly findingsByClause = computed<Bar[]>(() => {
    const counts = new Map<string, number>();
    for (const nc of this.ncs()) counts.set(nc.clauseId, (counts.get(nc.clauseId) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([clause, count]) => ({ label: `cl. ${clause}`, count, pct: Math.round((count / max) * 100), tone: 'critical' as const }));
  });

  protected readonly capaBreakdown = computed<Bar[]>(() => {
    const capas = this.store.capas();
    const now = Date.now();
    const open = capas.filter((c) => c.status !== 'verified' && !(c.dueDate && new Date(c.dueDate).getTime() < now)).length;
    const overdue = capas.filter((c) => c.dueDate && c.status !== 'verified' && new Date(c.dueDate).getTime() < now).length;
    const verified = capas.filter((c) => c.status === 'verified').length;
    const max = Math.max(1, open, overdue, verified);
    const toBar = (label: string, count: number, tone: Bar['tone']): Bar => ({ label, count, pct: Math.round((count / max) * 100), tone });
    return [toBar('Verified', verified, 'positive'), toBar('In progress', open, 'progress'), toBar('Overdue', overdue, 'critical')];
  });

  /** Performance indicators with actual-vs-target variance, for the trend strip. */
  protected readonly performance = computed(() =>
    this.store.performanceMetrics().map((m) => {
      const v = metricVariance(m);
      return {
        indicator: m.indicator,
        unit: m.unit,
        actual: m.actualValue,
        target: m.targetValue,
        trend: m.trend,
        pct: m.targetValue && m.actualValue != null ? Math.min(140, Math.round((m.actualValue / m.targetValue) * 100)) : null,
        over: v != null && v.absolute > 0,
      };
    }),
  );

  protected alertIcon(severity: string): string {
    return severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info';
  }

  /** 5×5 aspect significance heat-map (likelihood rows 5→1, severity cols 1→5). */
  protected readonly heatmap = computed(() => {
    const scored = this.store.aspects().filter((a) => a.severityScore && a.likelihoodScore);
    const rows = [5, 4, 3, 2, 1].map((lik) => ({
      lik,
      cells: [1, 2, 3, 4, 5].map((sev) => {
        const count = scored.filter((a) => a.severityScore === sev && a.likelihoodScore === lik).length;
        const score = sev * lik;
        return { sev, lik, count, band: score >= 15 ? 'high' : score >= 6 ? 'medium' : 'low' };
      }),
    }));
    return { rows, total: scored.length };
  });

  /** Carbon footprint rollup (GHG Scope 1/2/3) for the dashboard summary card. */
  protected readonly carbon = computed(() => carbonRollup(this.store.carbon()));
  protected readonly fmtTco2e = formatTco2e;
}
