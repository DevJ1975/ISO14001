import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateRiskRating } from '../src/app/core/domain/ohs-registers';
import { hiraColumns } from '../src/app/features/registers/registers-export';

/**
 * The HIRA register (ISO 45001 cl. 6.1.2) scores each hazard's initial and
 * residual risk as severity × likelihood (1–5 each → 1–25) and bands it
 * low/medium/high. It reuses the shared {@link evaluateRiskRating} helper so the
 * banding is identical to the aspects register; these tests pin the banding the
 * HIRA UI and CSV export depend on.
 */
describe('HIRA risk banding (severity × likelihood → band)', () => {
  const band = (severity?: number, likelihood?: number) => evaluateRiskRating({ severity, likelihood }).band;
  const score = (severity?: number, likelihood?: number) => evaluateRiskRating({ severity, likelihood }).score;

  it('returns low when either factor is unscored (score 0)', () => {
    assert.equal(score(undefined, undefined), 0);
    assert.equal(band(undefined, undefined), 'low');
    assert.equal(band(5, undefined), 'low');
    assert.equal(band(undefined, 5), 'low');
  });

  it('bands low for products below 6', () => {
    assert.equal(score(1, 1), 1);
    assert.equal(band(1, 1), 'low');
    assert.equal(score(2, 2), 4);
    assert.equal(band(2, 2), 'low');
    assert.equal(band(5, 1), 'low'); // 5 < 6
  });

  it('bands medium for products 6–14', () => {
    assert.equal(score(2, 3), 6);
    assert.equal(band(2, 3), 'medium');
    assert.equal(band(3, 3), 'medium'); // 9
    assert.equal(score(2, 5), 10);
    assert.equal(band(2, 5), 'medium');
  });

  it('bands high for products 15 and above', () => {
    assert.equal(score(3, 5), 15);
    assert.equal(band(3, 5), 'high');
    assert.equal(score(5, 5), 25);
    assert.equal(band(5, 5), 'high');
  });

  it('drops a hazard from high (initial) to low (residual) once controls are applied', () => {
    // Working-at-height seed row: severity stays 5, likelihood falls 3 → 1.
    assert.equal(band(5, 3), 'high'); // 15 — initial
    assert.equal(band(5, 1), 'low'); // 5 — residual after a fixed guardrail
  });
});

describe('HIRA CSV export columns', () => {
  it('exports activity, hazard, both bands and the hierarchy-of-controls type', () => {
    const headers = hiraColumns.map((c) => c.header);
    for (const header of ['Activity / task', 'Routineness', 'Hazard', 'Who at harm', 'Initial band', 'Control type', 'Residual band', 'Result']) {
      assert.ok(headers.includes(header), `expected column "${header}"`);
    }
  });

  it('derives the initial and residual bands in the exported row', () => {
    const row = {
      id: 'hira1', activity: 'Roof access', routineness: 'nonRoutine' as const, hazard: 'Fall from height',
      whoAtHarm: 'Technicians', severity: 5, likelihood: 3, controlType: 'engineering' as const,
      residualSeverity: 5, residualLikelihood: 1, result: 'needsFollowUp' as const, updatedAt: '', sync: 'synced' as const,
    };
    const initial = hiraColumns.find((c) => c.header === 'Initial band')!.value(row);
    const residual = hiraColumns.find((c) => c.header === 'Residual band')!.value(row);
    assert.equal(initial, 'high');
    assert.equal(residual, 'low');
  });
});
