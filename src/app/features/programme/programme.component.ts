import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { recertificationDue, surveillanceDue } from '../../core/domain';
import { AuditTypeKind, PlannedStatus, ProgrammeStore } from '../../core/programme/programme-store';

@Component({
  selector: 'app-programme',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './programme.component.html',
  styleUrl: './programme.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgrammeComponent {
  protected readonly store = inject(ProgrammeStore);
  private readonly auth = inject(AuthService);

  protected readonly canEdit = computed(() => ['leadAuditor', 'tenantAdmin'].includes(this.auth.user()?.role ?? ''));
  protected readonly newType = signal<AuditTypeKind>('surveillance');

  protected readonly types: { value: AuditTypeKind; label: string }[] = [
    { value: 'internal', label: 'Internal' },
    { value: 'certificationStage1', label: 'Certification (stage 1)' },
    { value: 'certificationStage2', label: 'Certification (stage 2)' },
    { value: 'surveillance', label: 'Surveillance' },
    { value: 'recertification', label: 'Recertification' },
    { value: 'special', label: 'Special' },
  ];

  protected readonly statuses: PlannedStatus[] = ['planned', 'inProgress', 'completed', 'cancelled'];

  protected typeLabel(type: AuditTypeKind): string {
    return this.types.find((t) => t.value === type)?.label ?? type;
  }

  protected statusTone(status: PlannedStatus): 'positive' | 'progress' | 'critical' | 'neutral' {
    if (status === 'completed') return 'positive';
    if (status === 'cancelled') return 'critical';
    if (status === 'inProgress') return 'progress';
    return 'neutral';
  }

  protected addPlanned(): void {
    this.store.addPlannedAudit(this.newType(), this.suggestDue(this.newType()));
  }

  protected suggestDue(type: AuditTypeKind): string {
    const now = new Date().toISOString();
    if (type === 'surveillance') return surveillanceDue(now).slice(0, 10);
    if (type === 'recertification') return recertificationDue(now).slice(0, 10);
    return now.slice(0, 10);
  }
}
