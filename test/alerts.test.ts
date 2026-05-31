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
    calibration: [],
    training: [],
    suppliers: [],
    changes: [],
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

  it('flags overdue and due-soon calibration', () => {
    const alerts = buildAlerts(
      emptyInput({
        calibration: [
          { id: 'k1', equipment: 'pH meter', nextDueAt: '2026-02-01' },
          { id: 'k2', equipment: 'Gas analyser', nextDueAt: '2026-06-10' },
          { id: 'k3', equipment: 'Spare', nextDueAt: '2026-02-01', outOfService: true },
        ],
      }),
    );
    assert.equal(alerts.find((a) => a.id === 'calib-k1')?.severity, 'critical');
    assert.equal(alerts.find((a) => a.id === 'calib-k2')?.severity, 'warning');
    assert.equal(alerts.find((a) => a.id === 'calib-k3'), undefined); // out of service is excluded
  });

  it('flags expired and expiring mandatory training only', () => {
    const alerts = buildAlerts(
      emptyInput({
        training: [
          { id: 't1', person: 'A', course: 'Spill response', completedAt: '2025-01-01', expiresAt: '2026-02-01', mandatory: true },
          { id: 't2', person: 'B', course: 'FLT', completedAt: '2025-06-10', expiresAt: '2026-06-10', mandatory: true },
          { id: 't3', person: 'C', course: 'Optional CPD', completedAt: '2025-01-01', expiresAt: '2026-02-01', mandatory: false },
          { id: 't4', person: 'D', course: 'Induction', completedAt: '2026-01-01' },
        ],
      }),
    );
    assert.equal(alerts.find((a) => a.id === 'training-t1')?.severity, 'critical');
    assert.equal(alerts.find((a) => a.id === 'training-t2')?.severity, 'warning');
    assert.equal(alerts.find((a) => a.id === 'training-t3'), undefined); // non-mandatory excluded
    assert.equal(alerts.find((a) => a.id === 'training-t4'), undefined); // current (no expiry) excluded
  });

  it('flags overdue and never-evaluated environmentally-relevant suppliers only', () => {
    const alerts = buildAlerts(
      emptyInput({
        suppliers: [
          { id: 's1', name: 'Waste carrier', environmentallyRelevant: true, lastEvaluatedAt: '2025-01-15', nextEvaluationAt: '2026-01-15' },
          { id: 's2', name: 'New recycler', environmentallyRelevant: true },
          { id: 's3', name: 'Current supplier', environmentallyRelevant: true, lastEvaluatedAt: '2026-01-01', nextEvaluationAt: '2027-01-01' },
          { id: 's4', name: 'Stationery', environmentallyRelevant: false },
        ],
      }),
    );
    assert.equal(alerts.find((a) => a.id === 'supplier-s1')?.severity, 'critical'); // re-evaluation overdue
    assert.equal(alerts.find((a) => a.id === 'supplier-s2')?.severity, 'warning'); // never evaluated
    assert.equal(alerts.find((a) => a.id === 'supplier-s3'), undefined); // current
    assert.equal(alerts.find((a) => a.id === 'supplier-s4'), undefined); // not environmentally relevant
  });

  it('flags changes implemented without an aspects review, and overdue open changes', () => {
    const alerts = buildAlerts(
      emptyInput({
        changes: [
          { id: 'm1', title: 'Solvent swap', status: 'implemented', aspectsReviewed: false },
          { id: 'm2', title: 'Waste store move', status: 'approved', aspectsReviewed: true, targetDate: '2026-04-30' },
          { id: 'm3', title: 'New still', status: 'assessing', aspectsReviewed: false, targetDate: '2026-12-31' },
          { id: 'm4', title: 'EPR rules', status: 'closed', aspectsReviewed: false },
        ],
      }),
    );
    assert.equal(alerts.find((a) => a.id === 'moc-m1')?.severity, 'critical'); // implemented w/o aspects review
    assert.equal(alerts.find((a) => a.id === 'moc-m2')?.severity, 'warning'); // open & past target
    assert.equal(alerts.find((a) => a.id === 'moc-m3'), undefined); // on track (future target, reviewed not required pre-approval)
    assert.equal(alerts.find((a) => a.id === 'moc-m4'), undefined); // closed/settled
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
