import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanCapa,
  cleanFinding,
  cleanRegister,
  isAuthConfigured,
  requireId,
  resolveCorsOrigin,
  ValidationError,
} from '../supabase/functions/api/_validation.js';

// The deployed backend is the Supabase edge function. Its security/validation
// logic previously had zero automated coverage; these tests exercise it
// directly so the *production* contract is enforced, not just the Node mirror.
describe('supabase edge-function security & validation', () => {
  it('never returns a wildcard CORS origin', () => {
    const allowed = ['https://audit.example.com', 'https://staging.example.com'];
    assert.equal(resolveCorsOrigin('https://staging.example.com', allowed), 'https://staging.example.com');
    // Unknown origin → falls back to the first configured origin, never '*'.
    assert.equal(resolveCorsOrigin('https://evil.example', allowed), 'https://audit.example.com');
    assert.equal(resolveCorsOrigin('https://evil.example', []), '');
    assert.notEqual(resolveCorsOrigin('https://evil.example', allowed), '*');
  });

  it('treats the app JWT as configured only when a dedicated secret is set', () => {
    assert.equal(isAuthConfigured(''), false);
    assert.equal(isAuthConfigured(undefined), false);
    assert.equal(isAuthConfigured('a-real-secret'), true);
  });

  it('requires a non-empty record id', () => {
    assert.throws(() => requireId(''), ValidationError);
    assert.throws(() => requireId('   '), ValidationError);
    assert.equal(requireId('nc-1'), 'nc-1');
  });

  it('rejects an unknown finding grade and oversized text', () => {
    assert.throws(
      () => cleanFinding({ type: 'totally-invalid', description: 'x' }, 'nc-1'),
      ValidationError,
    );
    assert.throws(
      () => cleanFinding({ type: 'minorNc', description: 'x'.repeat(8001) }, 'nc-1'),
      ValidationError,
    );
  });

  it('keeps only vetted finding fields', () => {
    const finding = cleanFinding(
      { type: 'majorNc', description: 'No evaluation of compliance.', clauseId: '9.1.2', systemic: true, hacked: 'DROP TABLE' },
      'nc-1',
    );
    assert.equal(finding['type'], 'majorNc');
    assert.equal(finding['systemic'], true);
    assert.equal('hacked' in finding, false);
  });

  it('clamps a client-supplied verified CAPA to verificationDue', () => {
    const capa = cleanCapa({ findingId: 'nc-1', status: 'verified' }, 'capa-1');
    assert.equal(capa['status'], 'verificationDue');
  });

  it('coerces an unknown register result to notStarted and drops unknown-typed junk safely', () => {
    const record = cleanRegister({ topic: 'Policy', direction: 'internal', result: 'bogus' }, 'comm-1');
    assert.equal(record['result'], 'notStarted');
    assert.equal(record['topic'], 'Policy');
    assert.equal(record['id'], 'comm-1');
  });

  it('preserves finite numeric register fields (performance metrics) as numbers', () => {
    const record = cleanRegister(
      { indicator: 'Electricity', unit: 'MWh', targetValue: 1200, actualValue: 1185, bogus: Infinity, result: 'conforming' },
      'metric-1',
    );
    assert.equal(record['targetValue'], 1200);
    assert.equal(record['actualValue'], 1185);
    assert.equal(typeof record['actualValue'], 'number');
    assert.equal(record['bogus'], 0); // non-finite numbers are clamped, not stringified
    assert.equal(record['result'], 'conforming');
  });
});
