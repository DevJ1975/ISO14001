import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FieldAuditStore } from '../../core/field/field-audit-store';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './report.component.html',
  styleUrl: './report.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportComponent {
  protected readonly store = inject(FieldAuditStore);

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

  protected sign(): void {
    this.store.signReport();
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
