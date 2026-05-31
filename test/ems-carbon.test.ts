import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carbonEntrySchema, carbonRollup, emissionTco2e, formatTco2e } from '../src/app/core/domain';

describe('carbon inventory (GHG Scope 1/2/3, cl. 9.1)', () => {
  it('computes tCO2e as activity × factor ÷ 1000', () => {
    // 4200 MWh × 183 kgCO2e/MWh = 768,600 kg = 768.6 t
    assert.equal(emissionTco2e({ activityData: 4200, emissionFactor: 183 }), 768.6);
  });

  it('honours a manual tCO2e override over the computed value', () => {
    assert.equal(emissionTco2e({ activityData: 4200, emissionFactor: 183, tco2eOverride: 500 }), 500);
  });

  it('returns 0 when activity or factor is missing', () => {
    assert.equal(emissionTco2e({ activityData: 4200 }), 0);
    assert.equal(emissionTco2e({}), 0);
  });

  it('rolls up per-scope totals and percentage shares', () => {
    const rollup = carbonRollup([
      { scope: 1, activityData: 1000, emissionFactor: 1000 }, // 1000 t
      { scope: 2, activityData: 500, emissionFactor: 1000 }, // 500 t
      { scope: 3, tco2eOverride: 500 }, // 500 t
    ]);
    assert.equal(rollup.scope1, 1000);
    assert.equal(rollup.scope2, 500);
    assert.equal(rollup.scope3, 500);
    assert.equal(rollup.total, 2000);
    assert.deepEqual(rollup.pct, { scope1: 50, scope2: 25, scope3: 25 });
    assert.equal(rollup.entryCount, 3);
  });

  it('defaults a missing scope to Scope 1 and handles an empty inventory', () => {
    assert.equal(carbonRollup([{ activityData: 10, emissionFactor: 1000 }]).scope1, 10);
    const empty = carbonRollup([]);
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.pct, { scope1: 0, scope2: 0, scope3: 0 });
  });

  it('formats tonnes with 1 dp under 100 t and whole numbers above', () => {
    assert.equal(formatTco2e(12.34), '12.3');
    assert.equal(formatTco2e(768.6), '769');
  });

  it('validates a carbon entry with defaults', () => {
    const entry = carbonEntrySchema.parse({
      id: 'c-1', tenantId: 't', auditId: 'a', source: 'Natural gas', scope: 1,
      activityData: 4200, activityUnit: 'MWh', emissionFactor: 183, updatedAt: '2026-05-31T00:00:00.000Z',
    });
    assert.equal(entry.result, 'notStarted');
    assert.deepEqual(entry.evidenceIds, []);
  });
});
