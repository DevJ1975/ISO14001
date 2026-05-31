import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAlerts, buildSchedule, type AlertInput } from '../src/app/core/alerts/alerts.logic';

const NOW = new Date('2026-05-31T00:00:00.000Z').getTime();

function emptyInput(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    now: NOW,
    capas: [],
    findings: [],
    permits: [],
    incidents: [],
    plannedAudits: [],
    complaints: [],
    outboxCount: 0,
    ...overrides,
  };
}

describe('alerts engine', () => {
  it('raises a critical alert for an overdue CAPA and an open major NC', () => {
    const alerts = buildAlerts(
      emptyInput({
        capas: [{ id: 'c1', dueDate: '2026-05-01', status: 'inProgress' }],
        findings: [{ id: 'f1', type: 'majorNc', clauseId: '9.1.2', status: 'open' }],
      }),
    );
    assert.equal(alerts.filter((a) => a.severity === 'critical').length, 2);
    assert.ok(alerts.some((a) => a.category === 'Corrective action'));
  });

  it('does not alert on a verified CAPA, a closed NC, or a future-due CAPA', () => {
    const alerts = buildAlerts(
      emptyInput({
        capas: [
          { id: 'c1', dueDate: '2026-05-01', status: 'verified' },
          { id: 'c2', dueDate: '2026-12-01', status: 'inProgress' },
        ],
        findings: [{ id: 'f1', type: 'majorNc', clauseId: '9.1', status: 'closed' }],
      }),
    );
    assert.deepEqual(alerts, []);
  });

  it('flags expired and expiring permits and open high-severity incidents', () => {
    const alerts = buildAlerts(
      emptyInput({
        permits: [
          { id: 'p1', title: 'Waste licence', expiresAt: '2026-02-28', renewalReminderDays: 90 },
          { id: 'p2', title: 'Effluent consent', expiresAt: '2026-07-15', renewalReminderDays: 90 },
        ],
        incidents: [{ id: 'i1', title: 'Spill', severity: 'high', status: 'investigating' }],
      }),
    );
    assert.equal(alerts.find((a) => a.id === 'permit-p1')?.severity, 'critical');
    assert.equal(alerts.find((a) => a.id === 'permit-p2')?.severity, 'warning');
    assert.equal(alerts.find((a) => a.id === 'incident-i1')?.severity, 'critical');
  });

  it('sorts critical before warning before info', () => {
    const alerts = buildAlerts(
      emptyInput({
        findings: [{ id: 'f1', type: 'minorNc', clauseId: '7.5', status: 'open' }],
        capas: [{ id: 'c1', dueDate: '2026-05-01', status: 'open' }],
        outboxCount: 3,
      }),
    );
    assert.deepEqual(
      alerts.map((a) => a.severity),
      ['critical', 'warning', 'info'],
    );
  });

  it('builds a date-sorted schedule of upcoming deadlines', () => {
    const events = buildSchedule(
      emptyInput({
        permits: [{ id: 'p1', title: 'Permit', expiresAt: '2026-09-30', renewalReminderDays: 90 }],
        plannedAudits: [{ id: 'a1', type: 'surveillance', dueDate: '2026-06-15', status: 'planned' }],
      }),
    );
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.date), ['2026-06-15', '2026-09-30']);
    assert.equal(events[0].kind, 'audit');
  });
});
