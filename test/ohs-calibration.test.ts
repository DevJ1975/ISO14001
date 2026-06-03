import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calibrationRecordSchema, calibrationStatus } from '../src/app/core/domain';

const NOW = '2026-05-31T00:00:00.000Z';

describe('equipment calibration (cl. 9.1.1)', () => {
  it('classifies by next-due date within a 30-day window', () => {
    assert.equal(calibrationStatus({ nextDueAt: '2027-01-15' }, NOW), 'valid');
    assert.equal(calibrationStatus({ nextDueAt: '2026-06-20' }, NOW), 'dueSoon');
    assert.equal(calibrationStatus({ nextDueAt: '2026-02-01' }, NOW), 'overdue');
    assert.equal(calibrationStatus({}, NOW), 'noDate');
  });

  it('treats out-of-service equipment distinctly', () => {
    assert.equal(calibrationStatus({ nextDueAt: '2026-02-01', outOfService: true }, NOW), 'outOfService');
  });

  it('validates a calibration record with defaults', () => {
    const record = calibrationRecordSchema.parse({
      id: 'cal-1', tenantId: 't', auditId: 'a', equipment: 'Stack analyser',
      identifier: 'AN-204', nextDueAt: '2027-01-15', frequencyMonths: 12, updatedAt: NOW,
    });
    assert.equal(record.result, 'notStarted');
    assert.deepEqual(record.evidenceIds, []);
  });
});
