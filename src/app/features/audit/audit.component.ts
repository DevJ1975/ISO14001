import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { AuditMeeting, AuditStatus, FieldAuditStore } from '../../core/field/field-audit-store';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly auth = inject(AuthService);

  protected readonly isLead = computed(() => this.auth.user()?.role === 'leadAuditor');

  protected readonly statuses: { value: AuditStatus; label: string }[] = [
    { value: 'planned', label: 'Planned' },
    { value: 'fieldwork', label: 'Fieldwork' },
    { value: 'reporting', label: 'Reporting' },
    { value: 'followUp', label: 'Follow-up' },
    { value: 'closed', label: 'Closed' },
  ];

  protected readonly opening = computed(() => this.store.meetings().find((m) => m.kind === 'opening') ?? null);
  protected readonly closing = computed(() => this.store.meetings().find((m) => m.kind === 'closing') ?? null);

  protected statusIndex(status: AuditStatus): number {
    return this.statuses.findIndex((s) => s.value === status);
  }

  protected setStatus(status: AuditStatus): void {
    this.store.setAuditStatus(status);
  }

  protected saveMeeting(
    kind: 'opening' | 'closing',
    attendees: string,
    agenda: string,
    notes: string,
    acknowledged: boolean,
  ): void {
    this.store.recordMeeting(kind, {
      datetimeAt: new Date().toISOString(),
      attendees: this.lines(attendees),
      agendaPoints: this.lines(agenda),
      notes: notes.trim() || undefined,
      acknowledged,
    });
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected meetingSaved(meeting: AuditMeeting | null): boolean {
    return !!meeting;
  }

  private lines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
}
