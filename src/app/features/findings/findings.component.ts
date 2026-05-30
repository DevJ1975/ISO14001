import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FieldAuditStore, FindingType } from '../../core/field/field-audit-store';

@Component({
  selector: 'app-findings',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './findings.component.html',
  styleUrl: './findings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FindingsComponent {
  protected readonly store = inject(FieldAuditStore);

  protected readonly counts = computed(() => {
    const totals = { majorNc: 0, minorNc: 0, ofi: 0, conformity: 0 };
    for (const finding of this.store.findings()) totals[finding.type] += 1;
    return totals;
  });

  protected typeLabel(type: FindingType): string {
    return { majorNc: 'Major NC', minorNc: 'Minor NC', ofi: 'Opportunity', conformity: 'Conformity' }[type];
  }

  protected typeTone(type: FindingType): 'positive' | 'progress' | 'critical' | 'neutral' {
    if (type === 'majorNc') return 'critical';
    if (type === 'minorNc') return 'progress';
    if (type === 'conformity') return 'positive';
    return 'neutral';
  }

  protected confirm(id: string): void {
    this.store.confirmFinding(id);
  }
}
