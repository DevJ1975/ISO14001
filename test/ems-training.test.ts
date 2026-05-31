import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { trainingRecordSchema, trainingStatus } from '../src/app/core/domain';

const NOW = '2026-05-31T00:00:00.000Z';

describe('training matrix (cl. 7.2)', () => {
  it('classifies by completion and expiry within a 30-day window', () => {
    assert.equal(trainingStatus({ completedAt: '2025-01-01', expiresAt: '2028-01-01' }, NOW), 'current');
    assert.equal(trainingStatus({ completedAt: '2025-06-20', expiresAt: '2026-06-20' }, NOW), 'dueSoon');
    assert.equal(trainingStatus({ completedAt: '2024-01-01', expiresAt: '2026-02-01' }, NOW), 'expired');
  });

  it('treats never-completed as notTrained and no-expiry as current', () => {
    assert.equal(trainingStatus({}, NOW), 'notTrained');
    assert.equal(trainingStatus({ completedAt: '2026-01-01' }, NOW), 'current');
  });

  it('validates a training record with defaults', () => {
    const record = trainingRecordSchema.parse({
      id: 'trn-1', tenantId: 't', auditId: 'a', person: 'M. Silva', course: 'Spill response',
      completedAt: '2025-07-01', expiresAt: '2026-07-01', frequencyMonths: 12, mandatory: true, updatedAt: NOW,
    });
    assert.equal(record.result, 'notStarted');
    assert.deepEqual(record.evidenceIds, []);
  });
});
