import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { environmentalAspectSchema, evaluateAspectSignificance } from '../src/app/core/domain';

describe('aspect significance scoring (cl. 6.1.2)', () => {
  it('bands severity × likelihood into low/medium/high', () => {
    assert.deepEqual(evaluateAspectSignificance({ severity: 1, likelihood: 1 }), { score: 1, band: 'low' });
    assert.deepEqual(evaluateAspectSignificance({ severity: 2, likelihood: 3 }), { score: 6, band: 'medium' });
    assert.deepEqual(evaluateAspectSignificance({ severity: 4, likelihood: 4 }), { score: 16, band: 'high' });
  });

  it('escalates the band for a legal concern (never stays low)', () => {
    assert.equal(evaluateAspectSignificance({ severity: 1, likelihood: 1, legalConcern: true }).band, 'medium');
    assert.equal(evaluateAspectSignificance({ severity: 3, likelihood: 3, legalConcern: true }).band, 'high');
    // legal on an already-high score stays high
    assert.equal(evaluateAspectSignificance({ severity: 5, likelihood: 5, legalConcern: true }).band, 'high');
  });

  it('lifts a low band to medium for a stakeholder concern only', () => {
    assert.equal(evaluateAspectSignificance({ severity: 1, likelihood: 2, stakeholderConcern: true }).band, 'medium');
    assert.equal(evaluateAspectSignificance({ severity: 3, likelihood: 3, stakeholderConcern: true }).band, 'medium');
  });

  it('treats unscored criteria as zero', () => {
    assert.deepEqual(evaluateAspectSignificance({}), { score: 0, band: 'low' });
    assert.deepEqual(evaluateAspectSignificance({ severity: 5 }), { score: 0, band: 'low' });
  });

  it('accepts scoring fields on the aspect schema and stays backward compatible', () => {
    const scored = environmentalAspectSchema.parse({
      id: 'asp-1', tenantId: 't', auditId: 'a', aspect: 'VOC emissions', activity: 'Coating',
      impact: 'Air quality', significance: 'high', severityScore: 4, likelihoodScore: 4,
      legalConcern: true, significanceRationale: 'Permit limit', updatedAt: new Date().toISOString(),
    });
    assert.equal(scored.severityScore, 4);
    assert.equal(scored.legalConcern, true);

    // An aspect with no scoring still validates (existing data).
    const bare = environmentalAspectSchema.parse({
      id: 'asp-2', tenantId: 't', auditId: 'a', aspect: 'Water use', activity: 'Cooling',
      impact: 'Abstraction', significance: 'medium', updatedAt: new Date().toISOString(),
    });
    assert.equal(bare.severityScore, undefined);
  });

  it('rejects an out-of-range score', () => {
    assert.throws(() =>
      environmentalAspectSchema.parse({
        id: 'asp-3', tenantId: 't', auditId: 'a', aspect: 'x', activity: 'y', impact: 'z',
        significance: 'low', severityScore: 9, updatedAt: new Date().toISOString(),
      }),
    );
  });
});
