import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { managementOfChangeRecordSchema, mocAttention } from '../src/app/core/domain';

const NOW = '2026-05-31T00:00:00.000Z';

describe('management of change (cl. 8.1)', () => {
  it('flags an approved/implemented change with no aspects review', () => {
    assert.equal(mocAttention({ status: 'approved', aspectsReviewed: false }, NOW), 'aspectsOutstanding');
    assert.equal(mocAttention({ status: 'implemented', aspectsReviewed: false }, NOW), 'aspectsOutstanding');
    assert.equal(mocAttention({ status: 'approved', aspectsReviewed: true }, NOW), 'onTrack');
  });

  it('flags an open change past its target date as overdue', () => {
    assert.equal(mocAttention({ status: 'assessing', aspectsReviewed: true, targetDate: '2026-01-01' }, NOW), 'overdue');
    assert.equal(mocAttention({ status: 'assessing', aspectsReviewed: true, targetDate: '2026-12-31' }, NOW), 'onTrack');
  });

  it('treats closed and rejected changes as settled (no action)', () => {
    assert.equal(mocAttention({ status: 'closed', aspectsReviewed: false, targetDate: '2026-01-01' }, NOW), 'settled');
    assert.equal(mocAttention({ status: 'rejected' }, NOW), 'settled');
  });

  it('prioritises the aspects gap over an overdue target', () => {
    // Implemented, no aspects review AND past target → the aspects gap is the headline.
    assert.equal(mocAttention({ status: 'implemented', aspectsReviewed: false, targetDate: '2026-01-01' }, NOW), 'aspectsOutstanding');
  });

  it('validates a change record with defaults', () => {
    const record = managementOfChangeRecordSchema.parse({
      id: 'moc-1', tenantId: 't', auditId: 'a', title: 'Switch degreaser',
      changeType: 'material', status: 'implemented', aspectsReviewed: false, updatedAt: NOW,
    });
    assert.equal(record.result, 'notStarted');
    assert.deepEqual(record.evidenceIds, []);
  });
});
