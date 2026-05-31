import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalReportContent,
  reportContentHash,
  shortFingerprint,
  verifyReportSignature,
  type SignableReport,
} from '../src/app/core/domain';

const baseReport = (): SignableReport => ({
  auditee: 'Northstar Components',
  criteria: 'ISO 14001:2026',
  scope: 'Coated components — Denver',
  auditType: 'stage2',
  overallConformity: 'Largely conforming',
  recommendation: 'recommend',
  findings: [
    { id: 'f2', type: 'minorNc', clauseId: '7.5', status: 'open', description: 'Doc control gap' },
    { id: 'f1', type: 'majorNc', clauseId: '9.1', status: 'open', description: 'Monitoring gap' },
  ],
});

describe('report e-signature (content integrity)', () => {
  it('canonicalises findings in a stable order regardless of input order', () => {
    const a = baseReport();
    const b: SignableReport = { ...a, findings: [a.findings[1]!, a.findings[0]!] };
    assert.equal(canonicalReportContent(a), canonicalReportContent(b));
  });

  it('produces a 64-char lowercase hex SHA-256 digest', async () => {
    const hash = await reportContentHash(baseReport());
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('is deterministic for identical content', async () => {
    assert.equal(await reportContentHash(baseReport()), await reportContentHash(baseReport()));
  });

  it('changes the digest when any signed field changes', async () => {
    const original = await reportContentHash(baseReport());
    const editedConclusion = await reportContentHash({ ...baseReport(), overallConformity: 'Nonconforming' });
    const editedFinding = await reportContentHash({
      ...baseReport(),
      findings: [{ id: 'f1', type: 'majorNc', clauseId: '9.1', status: 'closed', description: 'Monitoring gap' }, baseReport().findings[0]!],
    });
    assert.notEqual(original, editedConclusion);
    assert.notEqual(original, editedFinding);
  });

  it('verifies a matching report and rejects a tampered one', async () => {
    const report = baseReport();
    const signature = { contentHash: await reportContentHash(report) };
    assert.equal(await verifyReportSignature(signature, report), true);
    assert.equal(await verifyReportSignature(signature, { ...report, recommendation: 'notRecommended' }), false);
  });

  it('formats a short, spaced fingerprint', () => {
    assert.equal(shortFingerprint('abcdef0123456789ffff'), 'ABCD EF01 2345');
  });
});
