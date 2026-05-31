import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import {
  AspectSignificanceResult,
  ClauseGuide,
  clauseGuideFor,
  evaluateAspectSignificance,
  metricVariance,
  PermitExpiryStatus,
  permitExpiryStatus,
} from '../../core/domain';
import { EnvironmentalAspect, FieldAuditStore, Permit, RegisterResult } from '../../core/field/field-audit-store';

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
