import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { documentReviewStatus } from '../src/app/core/domain';

const NOW = '2026-05-31T00:00:00.000Z';

describe('document control review status (cl. 7.5)', () => {
  it('classifies by next-review date within a 30-day window', () => {
    assert.equal(documentReviewStatus({ nextReviewAt: '2027-01-01' }, NOW), 'current');
    assert.equal(documentReviewStatus({ nextReviewAt: '2026-06-20' }, NOW), 'dueSoon');
    assert.equal(documentReviewStatus({ nextReviewAt: '2026-01-01' }, NOW), 'overdue');
    assert.equal(documentReviewStatus({}, NOW), 'noDate');
  });
});
