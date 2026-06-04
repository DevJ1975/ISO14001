import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_JURISDICTION,
  JURISDICTION_IDS,
  allJurisdictions,
  isJurisdictionId,
  jurisdictionConfig,
} from '../src/app/core/domain/jurisdiction';

describe('jurisdiction config helper', () => {
  it('returns a usable config for each known jurisdiction', () => {
    for (const id of JURISDICTION_IDS) {
      const config = jurisdictionConfig(id);
      assert.equal(config.id, id);
      assert.ok(config.label.length > 0);
      assert.ok(config.dateFormat.length > 0);
      assert.ok(config.complianceFraming.length > 0);
      assert.ok(config.regulatorHint.length > 0);
      assert.ok(config.firstDayOfWeek === 0 || config.firstDayOfWeek === 1);
      assert.ok(config.units === 'metric' || config.units === 'imperial');
    }
  });

  it('uses US conventions (MM/dd, imperial, Sunday start) for the US', () => {
    const us = jurisdictionConfig('US');
    assert.equal(us.dateFormat, 'MM/dd/yyyy');
    assert.equal(us.units, 'imperial');
    assert.equal(us.firstDayOfWeek, 0);
  });

  it('uses UK conventions (dd/MM, metric, Monday start) for the UK', () => {
    const uk = jurisdictionConfig('UK');
    assert.equal(uk.dateFormat, 'dd/MM/yyyy');
    assert.equal(uk.units, 'metric');
    assert.equal(uk.firstDayOfWeek, 1);
  });

  it('falls back to the default jurisdiction for unknown/invalid ids', () => {
    assert.equal(jurisdictionConfig('XX').id, DEFAULT_JURISDICTION);
    assert.equal(jurisdictionConfig(undefined).id, DEFAULT_JURISDICTION);
    assert.equal(jurisdictionConfig(null).id, DEFAULT_JURISDICTION);
    assert.equal(jurisdictionConfig(42).id, DEFAULT_JURISDICTION);
  });

  it('isJurisdictionId guards values', () => {
    assert.equal(isJurisdictionId('UK'), true);
    assert.equal(isJurisdictionId('OTHER'), true);
    assert.equal(isJurisdictionId('xx'), false);
    assert.equal(isJurisdictionId(null), false);
  });

  it('allJurisdictions returns every jurisdiction in menu order', () => {
    const all = allJurisdictions();
    assert.equal(all.length, JURISDICTION_IDS.length);
    assert.deepEqual(
      all.map((c) => c.id),
      [...JURISDICTION_IDS],
    );
  });

  it('contains no verbatim standard wording and no "shall"', () => {
    for (const config of allJurisdictions()) {
      assert.ok(!/\bshall\b/i.test(config.complianceFraming), `framing for ${config.id} must not use "shall"`);
      assert.ok(!/\bshall\b/i.test(config.regulatorHint), `regulator hint for ${config.id} must not use "shall"`);
    }
  });
});
