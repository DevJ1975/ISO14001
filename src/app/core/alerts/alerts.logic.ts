import {
  calibrationStatus,
  type ComplaintStatus,
  type IncidentStatus,
  isComplaintOverdue,
  isIncidentOpen,
  permitExpiryStatus,
  trainingStatus,
} from '../domain';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  due?: string;
  link: string;
  fragment?: string;
}

export interface ScheduleEvent {
  id: string;
  date: string;
  kind: 'audit' | 'permit' | 'complaint';
  label: string;
  tone: AlertSeverity;
  link: string;
}

export interface AlertInput {
  now: number;
  capas: { id: string; dueDate?: string; status: string }[];
  findings: { id: string; type: string; clauseId: string; status: string }[];
  permits: { id: string; title: string; expiresAt?: string; renewalReminderDays?: number }[];
  calibration: { id: string; equipment: string; nextDueAt?: string; outOfService?: boolean }[];
  training: { id: string; person: string; course: string; completedAt?: string; expiresAt?: string; mandatory?: boolean }[];
  incidents: { id: string; title: string; severity: string; status: string }[];
  plannedAudits: { id: string; type: string; dueDate: string; status: string }[];
  complaints: { id: string; kind: string; subject: string; dueDate?: string; status: string }[];
  outboxCount: number;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Build the prioritised, cross-cutting "needs attention" list. Pure & testable. */
export function buildAlerts(input: AlertInput): AlertItem[] {
  const items: AlertItem[] = [];

  for (const capa of input.capas) {
    if (capa.dueDate && capa.status !== 'verified' && new Date(capa.dueDate).getTime() < input.now) {
      items.push({ id: `capa-${capa.id}`, severity: 'critical', category: 'Corrective action', title: 'CAPA overdue', due: capa.dueDate, link: '/findings' });
    }
  }

  for (const finding of input.findings) {
    if ((finding.type === 'majorNc' || finding.type === 'minorNc') && finding.status !== 'closed') {
      items.push({
        id: `nc-${finding.id}`,
        severity: finding.type === 'majorNc' ? 'critical' : 'warning',
        category: 'Nonconformity',
        title: `Open ${finding.type === 'majorNc' ? 'major' : 'minor'} NC · cl. ${finding.clauseId}`,
        link: '/findings',
      });
    }
  }

  for (const permit of input.permits) {
    const status = permitExpiryStatus(permit, new Date(input.now));
    if (status === 'expired' || status === 'expiringSoon') {
      items.push({
        id: `permit-${permit.id}`,
        severity: status === 'expired' ? 'critical' : 'warning',
        category: 'Permit',
        title: `${permit.title || 'Permit'} ${status === 'expired' ? 'expired' : 'expiring'}`,
        due: permit.expiresAt,
        link: '/registers',
        fragment: 'permits',
      });
    }
  }

  for (const incident of input.incidents) {
    if (isIncidentOpen({ status: incident.status as IncidentStatus })) {
      items.push({
        id: `incident-${incident.id}`,
        severity: incident.severity === 'high' ? 'critical' : 'warning',
        category: 'Incident',
        title: `Open incident: ${incident.title || 'untitled'}`,
        link: '/registers',
        fragment: 'incidents',
      });
    }
  }

  for (const calib of input.calibration) {
    const status = calibrationStatus(calib, new Date(input.now));
    if (status === 'overdue' || status === 'dueSoon') {
      items.push({
        id: `calib-${calib.id}`,
        severity: status === 'overdue' ? 'critical' : 'warning',
        category: 'Calibration',
        title: `${calib.equipment || 'Equipment'} calibration ${status === 'overdue' ? 'overdue' : 'due soon'}`,
        due: calib.nextDueAt,
        link: '/registers',
        fragment: 'calibration',
      });
    }
  }

  for (const t of input.training) {
    const status = trainingStatus(t, new Date(input.now));
    // Only mandatory training raises an alert; lapsed mandatory training is a classic NC.
    if (t.mandatory && (status === 'expired' || status === 'dueSoon')) {
      items.push({
        id: `training-${t.id}`,
        severity: status === 'expired' ? 'critical' : 'warning',
        category: 'Training',
        title: `${t.course || 'Training'} ${status === 'expired' ? 'expired' : 'expiring'}${t.person ? ' · ' + t.person : ''}`,
        due: t.expiresAt,
        link: '/registers',
        fragment: 'training',
      });
    }
  }

  for (const planned of input.plannedAudits) {
    if ((planned.status === 'planned' || planned.status === 'inProgress') && new Date(planned.dueDate).getTime() < input.now) {
      items.push({ id: `planned-${planned.id}`, severity: 'warning', category: 'Programme', title: `${planned.type} audit overdue`, due: planned.dueDate, link: '/programme' });
    }
  }

  for (const item of input.complaints) {
    if (isComplaintOverdue({ status: item.status as ComplaintStatus, dueDate: item.dueDate }, new Date(input.now))) {
      items.push({ id: `case-${item.id}`, severity: 'warning', category: item.kind === 'appeal' ? 'Appeal' : 'Complaint', title: `${item.subject || 'Case'} overdue`, due: item.dueDate, link: '/programme' });
    }
  }

  if (input.outboxCount > 0) {
    items.push({ id: 'outbox', severity: 'info', category: 'Sync', title: `${input.outboxCount} change(s) not yet synced`, link: '/report' });
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.due ?? '').localeCompare(b.due ?? ''));
}

/** Upcoming deadlines for the schedule/timeline (planned audits, permit expiries, complaint due dates). */
export function buildSchedule(input: AlertInput): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];

  for (const permit of input.permits) {
    if (permit.expiresAt) {
      const status = permitExpiryStatus(permit, new Date(input.now));
      events.push({
        id: `permit-${permit.id}`,
        date: String(permit.expiresAt).slice(0, 10),
        kind: 'permit',
        label: `${permit.title || 'Permit'} expires`,
        tone: status === 'expired' ? 'critical' : status === 'expiringSoon' ? 'warning' : 'info',
        link: '/registers',
      });
    }
  }

  for (const planned of input.plannedAudits) {
    if (planned.status === 'completed' || planned.status === 'cancelled') continue;
    const overdue = new Date(planned.dueDate).getTime() < input.now;
    events.push({ id: `planned-${planned.id}`, date: String(planned.dueDate).slice(0, 10), kind: 'audit', label: `${planned.type} audit`, tone: overdue ? 'warning' : 'info', link: '/programme' });
  }

  for (const item of input.complaints) {
    if (item.dueDate && (item.status === 'received' || item.status === 'underReview')) {
      events.push({ id: `case-${item.id}`, date: String(item.dueDate).slice(0, 10), kind: 'complaint', label: `${item.kind}: ${item.subject || 'case'}`, tone: isComplaintOverdue({ status: item.status as ComplaintStatus, dueDate: item.dueDate }, new Date(input.now)) ? 'warning' : 'info', link: '/programme' });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}
