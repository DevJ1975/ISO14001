import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hazardSchema, evaluateRiskRating } from '../src/app/core/domain';

describe('OH&S risk rating (cl. 6.1.2)', () => {
  it('bands severity × likelihood into low/medium/high', () => {
    assert.deepEqual(evaluateRiskRating({ severity: 1, likelihood: 1 }), { score: 1, band: 'low' });
    assert.deepEqual(evaluateRiskRating({ severity: 2, likelihood: 3 }), { score: 6, band: 'medium' });
    assert.deepEqual(evaluateRiskRating({ severity: 4, likelihood: 4 }), { score: 16, band: 'high' });
  });

  it('escalates the band for a legal duty (never stays low)', () => {
    assert.equal(evaluateRiskRating({ severity: 1, likelihood: 1, legalConcern: true }).band, 'medium');
    assert.equal(evaluateRiskRating({ severity: 3, likelihood: 3, legalConcern: true }).band, 'high');
    // legal on an already-high score stays high
    assert.equal(evaluateRiskRating({ severity: 5, likelihood: 5, legalConcern: true }).band, 'high');
  });

  it('lifts a low band to medium for a worker concern only', () => {
    assert.equal(evaluateRiskRating({ severity: 1, likelihood: 2, workerConcern: true }).band, 'medium');
    assert.equal(evaluateRiskRating({ severity: 3, likelihood: 3, workerConcern: true }).band, 'medium');
  });

  it('treats unscored criteria as zero', () => {
    assert.deepEqual(evaluateRiskRating({}), { score: 0, band: 'low' });
    assert.deepEqual(evaluateRiskRating({ severity: 5 }), { score: 0, band: 'low' });
  });

  it('accepts scoring fields on the hazard schema and stays backward compatible', () => {
    const scored = hazardSchema.parse({
      id: 'haz-1', tenantId: 't', auditId: 'a', hazard: 'Working at height', activity: 'Roof access',
      harm: 'Fall — serious injury', riskBand: 'high', severityScore: 4, likelihoodScore: 4,
      legalConcern: true, riskRatingRationale: 'Work at Height Regulations', updatedAt: new Date().toISOString(),
    });
    assert.equal(scored.severityScore, 4);
    assert.equal(scored.legalConcern, true);

    // A hazard with no scoring still validates (existing data).
    const bare = hazardSchema.parse({
      id: 'haz-2', tenantId: 't', auditId: 'a', hazard: 'Manual handling', activity: 'Loading bay',
      harm: 'Musculoskeletal injury', riskBand: 'medium', updatedAt: new Date().toISOString(),
    });
    assert.equal(bare.severityScore, undefined);
  });

  it('rejects an out-of-range score', () => {
    assert.throws(() =>
      hazardSchema.parse({
        id: 'haz-3', tenantId: 't', auditId: 'a', hazard: 'x', activity: 'y', harm: 'z',
        riskBand: 'low', severityScore: 9, updatedAt: new Date().toISOString(),
      }),
    );
  });
});
