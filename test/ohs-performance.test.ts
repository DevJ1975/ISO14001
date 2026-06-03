import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveTrend, metricVariance, performanceMetricSchema } from '../src/app/core/domain';

describe('environmental performance metrics (cl. 9.1)', () => {
  it('computes actual-vs-target variance with percentage', () => {
    const v = metricVariance({ actualValue: 1185, targetValue: 1200 });
    assert.ok(v);
    assert.equal(v!.absolute, -15);
    assert.equal(v!.percent, -1.2); // -15/1200 = -1.25%, rounded to 1 dp
  });

  it('returns null variance when a value is missing, and null percent at zero target', () => {
    assert.equal(metricVariance({ actualValue: 10 }), null);
    assert.equal(metricVariance({ targetValue: 10 }), null);
    assert.equal(metricVariance({ actualValue: 5, targetValue: 0 })!.percent, null);
  });

  it('derives an improving trend when a lower-is-better series falls', () => {
    assert.equal(deriveTrend([1320, 1250, 1185]), 'improving');
    assert.equal(deriveTrend([8000, 8200, 8420]), 'worsening');
    assert.equal(deriveTrend([500, 501, 499]), 'stable');
    assert.equal(deriveTrend([42]), 'notEvaluated');
  });

  it('flips direction when higher is better (e.g. recycling rate)', () => {
    assert.equal(deriveTrend([60, 68, 74], false), 'improving');
    assert.equal(deriveTrend([74, 68, 60], false), 'worsening');
  });

  it('validates a metric and applies defaults', () => {
    const metric = performanceMetricSchema.parse({
      id: 'metric-1',
      tenantId: 't',
      auditId: 'a',
      indicator: 'Grid electricity',
      unit: 'MWh',
      period: '2025',
      targetValue: 1200,
      actualValue: 1185,
      updatedAt: new Date().toISOString(),
    });
    assert.equal(metric.category, 'energy');
    assert.equal(metric.trend, 'notEvaluated');
    assert.equal(metric.result, 'notStarted');
    assert.deepEqual(metric.evidenceIds, []);
  });

  it('rejects a non-finite measured value', () => {
    assert.throws(() =>
      performanceMetricSchema.parse({
        id: 'm', tenantId: 't', auditId: 'a', indicator: 'x',
        actualValue: Number.POSITIVE_INFINITY, updatedAt: new Date().toISOString(),
      }),
    );
  });
});
