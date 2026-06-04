import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { supplierEvaluationStatus, supplierRecordSchema } from '../src/app/core/domain';

const NOW = '2026-05-31T00:00:00.000Z';

describe('supplier/contractor evaluation (cl. 8.1)', () => {
  it('classifies relevant suppliers by next-evaluation date within a 30-day window', () => {
    assert.equal(supplierEvaluationStatus({ environmentallyRelevant: true, lastEvaluatedAt: '2026-01-01', nextEvaluationAt: '2027-01-01' }, NOW), 'current');
    assert.equal(supplierEvaluationStatus({ environmentallyRelevant: true, lastEvaluatedAt: '2025-06-20', nextEvaluationAt: '2026-06-20' }, NOW), 'dueSoon');
    assert.equal(supplierEvaluationStatus({ environmentallyRelevant: true, lastEvaluatedAt: '2025-01-01', nextEvaluationAt: '2026-01-01' }, NOW), 'overdue');
  });

  it('treats a relevant-but-never-evaluated supplier as notEvaluated', () => {
    assert.equal(supplierEvaluationStatus({ environmentallyRelevant: true }, NOW), 'notEvaluated');
  });

  it('excludes non-relevant suppliers from the evaluation chase', () => {
    assert.equal(supplierEvaluationStatus({ environmentallyRelevant: false, nextEvaluationAt: '2026-01-01' }, NOW), 'notRelevant');
    assert.equal(supplierEvaluationStatus({}, NOW), 'notRelevant');
  });

  it('treats a relevant supplier with an evaluation but no next date as current', () => {
    assert.equal(supplierEvaluationStatus({ environmentallyRelevant: true, lastEvaluatedAt: '2026-01-01' }, NOW), 'current');
  });

  it('validates a supplier record with defaults', () => {
    const record = supplierRecordSchema.parse({
      id: 'sup-1', tenantId: 't', auditId: 'a', name: 'GreenWaste Carriers Ltd',
      category: 'wasteCarrier', environmentallyRelevant: true, nextEvaluationAt: '2027-01-10', updatedAt: NOW,
    });
    assert.equal(record.rating, 'notRated');
    assert.equal(record.result, 'notStarted');
    assert.deepEqual(record.evidenceIds, []);
  });
});
