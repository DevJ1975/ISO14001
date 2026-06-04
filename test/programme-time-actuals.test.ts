import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auditDayVariance, plannedAuditSchema, summarisePlannedTime } from '../src/app/core/domain';

describe('audit-time planning & actuals (planned vs actual audit-days)', () => {
  it('keeps the planned-audit fields intact and accepts optional day figures', () => {
    const parsed = plannedAuditSchema.parse({
      id: 'plan-1',
      type: 'surveillance',
      dueDate: '2026-09-01T00:00:00.000Z',
    });
    assert.equal(parsed.status, 'planned');
    assert.equal(parsed.plannedDays, undefined);
    assert.equal(parsed.actualDays, undefined);

    const withDays = plannedAuditSchema.parse({
      id: 'plan-2',
      type: 'certificationStage2',
      dueDate: '2026-10-01T00:00:00.000Z',
      plannedDays: 3,
      actualDays: 3.5,
    });
    assert.equal(withDays.plannedDays, 3);
    assert.equal(withDays.actualDays, 3.5);
  });

  describe('auditDayVariance', () => {
    it('reports a positive variance when the audit ran over its plan', () => {
      assert.equal(auditDayVariance(3, 4), 1);
    });

    it('reports a negative variance when the audit ran under its plan', () => {
      assert.equal(auditDayVariance(4, 3), -1);
    });

    it('reports zero variance when planned equals actual', () => {
      assert.equal(auditDayVariance(3, 3), 0);
    });

    it('is undefined-safe — returns 0 when either figure is unset', () => {
      assert.equal(auditDayVariance(undefined, 3), 0);
      assert.equal(auditDayVariance(3, undefined), 0);
      assert.equal(auditDayVariance(undefined, undefined), 0);
    });
  });

  describe('summarisePlannedTime', () => {
    it('rolls up totals, net variance and over/under counts', () => {
      const summary = summarisePlannedTime([
        { plannedDays: 3, actualDays: 4 }, // over
        { plannedDays: 5, actualDays: 4 }, // under
        { plannedDays: 2, actualDays: 2 }, // on plan
      ]);
      assert.equal(summary.totalPlanned, 10);
      assert.equal(summary.totalActual, 10);
      assert.equal(summary.variance, 0);
      assert.equal(summary.overCount, 1);
      assert.equal(summary.underCount, 1);
    });

    it('returns zeroed totals for an empty list', () => {
      const summary = summarisePlannedTime([]);
      assert.deepEqual(summary, {
        totalPlanned: 0,
        totalActual: 0,
        variance: 0,
        overCount: 0,
        underCount: 0,
      });
    });

    it('defaults to an empty list when called with no argument', () => {
      const summary = summarisePlannedTime();
      assert.equal(summary.totalPlanned, 0);
      assert.equal(summary.totalActual, 0);
    });

    it('is undefined-safe — rows missing either figure add nothing and are not counted', () => {
      const summary = summarisePlannedTime([
        { plannedDays: 4 }, // no actual recorded yet
        { actualDays: 2 }, // unplanned but recorded
        { plannedDays: 3, actualDays: 5 }, // over
      ]);
      assert.equal(summary.totalPlanned, 7);
      assert.equal(summary.totalActual, 7);
      assert.equal(summary.variance, 0);
      assert.equal(summary.overCount, 1);
      assert.equal(summary.underCount, 0);
    });
  });
});
