import { Injectable, Signal, computed, inject } from '@angular/core';

import { FieldAuditStore } from '../field/field-audit-store';
import { ProgrammeStore } from '../programme/programme-store';
import { AlertInput, AlertItem, ScheduleEvent, buildAlerts, buildSchedule } from './alerts.logic';

export type { AlertItem, AlertSeverity, ScheduleEvent } from './alerts.logic';

/**
 * Consolidated, cross-store "needs attention" engine — the action-tracking /
 * alerting layer comparable EHS/audit platforms lead with. Assembles plain data
 * from the field-audit and programme stores and delegates to the pure
 * `alerts.logic` functions; reused by the dashboard, actions centre and schedule.
 */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly field = inject(FieldAuditStore);
  private readonly programme = inject(ProgrammeStore);

  private readonly input = computed<AlertInput>(() => {
    const programme = this.programme.programme();
    return {
      now: Date.now(),
      capas: this.field.capas().map((c) => ({ id: c.id, dueDate: c.dueDate, status: c.status })),
      findings: this.field.findings().map((f) => ({ id: f.id, type: f.type, clauseId: f.clauseId, status: f.status })),
      permits: this.field.permits().map((p) => ({ id: p.id, title: p.title, expiresAt: p.expiresAt, renewalReminderDays: p.renewalReminderDays })),
      calibration: this.field.calibration().map((c) => ({ id: c.id, equipment: c.equipment, nextDueAt: c.nextDueAt, outOfService: c.outOfService })),
      training: this.field.training().map((t) => ({ id: t.id, person: t.person, course: t.course, completedAt: t.completedAt, expiresAt: t.expiresAt, mandatory: t.mandatory })),
      suppliers: this.field.suppliers().map((s) => ({ id: s.id, name: s.name, environmentallyRelevant: s.environmentallyRelevant, lastEvaluatedAt: s.lastEvaluatedAt, nextEvaluationAt: s.nextEvaluationAt })),
      changes: this.field.changes().map((c) => ({ id: c.id, title: c.title, status: c.status, aspectsReviewed: c.aspectsReviewed, targetDate: c.targetDate })),
      incidents: this.field.incidents().map((i) => ({ id: i.id, title: i.title, severity: i.severity, status: i.status })),
      plannedAudits: (programme?.plannedAudits ?? []).map((a) => ({ id: a.id, type: a.type, dueDate: a.dueDate, status: a.status })),
      complaints: (programme?.complaintsAppeals ?? []).map((c) => ({ id: c.id, kind: c.kind, subject: c.subject, dueDate: typeof c.dueDate === 'string' ? c.dueDate : undefined, status: c.status })),
      outboxCount: this.field.outboxCount(),
    };
  });

  readonly alerts: Signal<AlertItem[]> = computed(() => buildAlerts(this.input()));

  readonly scheduleEvents: Signal<ScheduleEvent[]> = computed(() => buildSchedule(this.input()));

  readonly counts = computed(() => {
    const list = this.alerts();
    return {
      total: list.length,
      critical: list.filter((a) => a.severity === 'critical').length,
      warning: list.filter((a) => a.severity === 'warning').length,
    };
  });

  /** Days until a date (negative if past); used by views for "in N days / N days overdue". */
  daysUntil(date: string): number {
    return Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000);
  }
}
