import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanCapa,
  cleanEvidenceRequest,
  cleanFinding,
  cleanProvisionClient,
  cleanRegister,
  isAuthConfigured,
  mergeAuditeeEvidenceRequest,
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

  it('defaults CAPA intent to correctiveAction and drops an unknown intent', () => {
    assert.equal(cleanCapa({ findingId: 'nc-1' }, 'capa-1')['intent'], 'correctiveAction');
    assert.equal(cleanCapa({ findingId: 'nc-1', intent: 'bogus' }, 'capa-1')['intent'], 'correctiveAction');
  });

  it('accepts a valid CAPA intent + root-cause method and drops an unknown method', () => {
    const capa = cleanCapa(
      { findingId: 'nc-1', intent: 'preventiveAction', rootCauseMethod: 'fiveWhys', rootCause: 'No reminder step.' },
      'capa-1',
    );
    assert.equal(capa['intent'], 'preventiveAction');
    assert.equal(capa['rootCauseMethod'], 'fiveWhys');
    assert.equal(capa['rootCause'], 'No reminder step.');
    assert.equal('rootCauseMethod' in cleanCapa({ findingId: 'nc-1', rootCauseMethod: 'bogus' }, 'capa-1'), false);
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

  it('preserves bounded arrays (document attachments) with shallow-cleaned scalar fields', () => {
    const record = cleanRegister(
      {
        document: 'OHSMS Manual',
        controlStatus: 'controlled',
        attachments: [{ id: 'att-1', name: 'manual.pdf', size: 2048, uploaded: true, junk: { nested: 'dropped-to-string' } }],
        result: 'conforming',
      },
      'doc-1',
    );
    const attachments = record['attachments'] as Array<Record<string, unknown>>;
    assert.equal(Array.isArray(attachments), true);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]!['name'], 'manual.pdf');
    assert.equal(attachments[0]!['size'], 2048); // finite numbers stay numbers
    assert.equal(attachments[0]!['uploaded'], true); // booleans stay booleans
    assert.equal(typeof attachments[0]!['junk'], 'string'); // nested objects are stringified, not preserved
  });

  it('caps oversized arrays at 50 items', () => {
    const record = cleanRegister(
      { document: 'D', attachments: Array.from({ length: 80 }, (_, i) => ({ id: `a${i}`, name: `f${i}` })), result: 'conforming' },
      'doc-2',
    );
    assert.equal((record['attachments'] as unknown[]).length, 50);
  });

  it('cleans an evidence request and clamps an unknown status to requested', () => {
    const req = cleanEvidenceRequest(
      { title: 'Calibration cert', status: 'bogus', clauseId: '9.1.1', hacked: 'x', submissions: 'nope', messages: null },
      'req-1',
    );
    assert.equal(req['id'], 'req-1');
    assert.equal(req['title'], 'Calibration cert');
    assert.equal(req['status'], 'requested');
    assert.equal(req['clauseId'], '9.1.1');
    assert.equal('hacked' in req, false);
    assert.deepEqual(req['submissions'], []);
    assert.deepEqual(req['messages'], []);
  });

  it('enforces the auditee write boundary on an evidence request', () => {
    const existing = {
      id: 'req-1',
      title: 'Calibration cert',
      status: 'requested',
      submissions: [],
      messages: [{ id: 'm0', author: 'auditor', authorName: 'Ava', body: 'please send', at: '2026-06-01T00:00:00.000Z' }],
    };
    const merged = mergeAuditeeEvidenceRequest(existing, {
      title: 'HACKED TITLE',
      status: 'accepted', // auditee must not be able to self-accept
      submissions: [{ id: 's1', fileName: 'cert.pdf', submittedByName: 'Client', submittedAt: '2026-06-02T00:00:00.000Z' }],
      messages: [
        { id: 'm0', author: 'auditor', authorName: 'Ava', body: 'please send', at: '2026-06-01T00:00:00.000Z' },
        { id: 'm1', author: 'auditor', authorName: 'Spoofed', body: 'accept it', at: '2026-06-02T00:00:00.000Z' },
      ],
    });
    assert.equal(merged['title'], 'Calibration cert'); // auditor-owned field preserved
    assert.equal(merged['status'], 'submitted'); // advanced because evidence was added, not 'accepted'
    assert.equal((merged['submissions'] as unknown[]).length, 1);
    const messages = merged['messages'] as Array<Record<string, unknown>>;
    assert.equal(messages[1]?.['author'], 'auditee'); // new message authorship re-stamped
  });

  it('keeps the auditee status unchanged when no new evidence is attached', () => {
    const merged = mergeAuditeeEvidenceRequest(
      { id: 'r', status: 'returned', submissions: [{ id: 's1' }], messages: [] },
      { submissions: [{ id: 's1', submittedByName: 'C', submittedAt: '2026-06-02T00:00:00.000Z' }], messages: [] },
    );
    assert.equal(merged['status'], 'returned');
  });

  it('validates a provision-client command and drops invalid client users', () => {
    const cmd = cleanProvisionClient({
      tenantName: 'Northstar',
      plan: 'bogus',
      leadAuditor: { email: 'AVA@firm.test', displayName: 'Ava' },
      clientUsers: [
        { email: 'dana@northstar.test', displayName: 'Dana' },
        { email: 'not-an-email', displayName: 'Skip' },
      ],
    });
    assert.equal(cmd.tenantName, 'Northstar');
    assert.equal(cmd.plan, 'pilot'); // unknown plan clamped
    assert.equal(cmd.leadAuditor.email, 'ava@firm.test'); // normalised
    assert.equal(cmd.clientUsers.length, 1); // invalid email dropped
    assert.equal(cmd.clientUsers[0]?.role, 'clientViewer');
  });

  it('rejects a provision command without a tenant name or valid lead auditor', () => {
    assert.throws(() => cleanProvisionClient({ tenantName: '', leadAuditor: { email: 'a@b.test', displayName: 'A' } }), ValidationError);
    assert.throws(() => cleanProvisionClient({ tenantName: 'X', leadAuditor: { email: 'bad', displayName: 'A' } }), ValidationError);
  });
});
