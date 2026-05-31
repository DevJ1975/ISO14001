import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { AlertsService, AlertItem } from '../../core/alerts/alerts.service';

/**
 * Action & alerts centre — a single, prioritised "what needs my attention" view
 * across the whole system (overdue CAPAs, open NCs, expiring permits, overdue
 * audits/complaints, open incidents, unsynced work). The consolidated action
 * tracking that every comparable audit/EHS platform provides.
 */
@Component({
  selector: 'app-actions',
  standalone: true,
  imports: [MatIconModule, RouterLink],
  templateUrl: './actions.component.html',
  styleUrl: './actions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionsComponent {
  private readonly alertsService = inject(AlertsService);

  protected readonly counts = this.alertsService.counts;

  protected readonly groups = computed<{ severity: 'critical' | 'warning' | 'info'; label: string; items: AlertItem[] }[]>(() => {
    const all = this.alertsService.alerts();
    const defs: { severity: 'critical' | 'warning' | 'info'; label: string }[] = [
      { severity: 'critical', label: 'Critical' },
      { severity: 'warning', label: 'Needs attention' },
      { severity: 'info', label: 'For information' },
    ];
    return defs
      .map((d) => ({ ...d, items: all.filter((a) => a.severity === d.severity) }))
      .filter((g) => g.items.length > 0);
  });

  protected dueLabel(due: string | undefined): string {
    if (!due) return '';
    const days = this.alertsService.daysUntil(due);
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'due today';
    return `in ${days}d`;
  }

  protected alertIcon(severity: string): string {
    return severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info';
  }
}
