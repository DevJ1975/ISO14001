import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canAuditeeSubmit,
  evidenceRequestSummary,
  isAwaitingAuditorReview,
  isOutstandingForAuditee,
  isOverdue,
  requestStatusLabel,
  sortRequests,
  type RequestView,
} from '../src/app/core/portal/evidence-requests.logic';

const NOW = '2026-06-15T00:00:00.000Z';

const req = (over: Partial<RequestView> & Pick<RequestView, 'status'>): RequestView => ({
  createdAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

describe('evidence-request portal logic', () => {
  it('routes outstanding work to the auditee for requested and returned', () => {
    assert.equal(isOutstandingForAuditee({ status: 'requested' }), true);
    assert.equal(isOutstandingForAuditee({ status: 'returned' }), true);
    assert.equal(isOutstandingForAuditee({ status: 'submitted' }), false);
    assert.equal(isOutstandingForAuditee({ status: 'accepted' }), false);
  });

  it('routes submitted requests to the auditor for review', () => {
    assert.equal(isAwaitingAuditorReview({ status: 'submitted' }), true);
    assert.equal(isAwaitingAuditorReview({ status: 'requested' }), false);
  });

  it('lets the auditee submit until the auditor accepts', () => {
    assert.equal(canAuditeeSubmit({ status: 'requested' }), true);
    assert.equal(canAuditeeSubmit({ status: 'returned' }), true);
    assert.equal(canAuditeeSubmit({ status: 'submitted' }), true);
    assert.equal(canAuditeeSubmit({ status: 'accepted' }), false);
  });

  it('flags overdue requests only when a past due date is set and not accepted', () => {
    assert.equal(isOverdue({ status: 'requested', dueDate: '2026-06-10' }, NOW), true);
    assert.equal(isOverdue({ status: 'returned', dueDate: '2026-06-20' }, NOW), false);
    assert.equal(isOverdue({ status: 'requested' }, NOW), false); // no due date
    assert.equal(isOverdue({ status: 'accepted', dueDate: '2026-06-10' }, NOW), false); // accepted is done
  });

  it('summarises what the auditee owes vs what the auditor must review', () => {
    const summary = evidenceRequestSummary(
      [
        req({ status: 'requested', dueDate: '2026-06-10' }), // toUpload + overdue
        req({ status: 'returned' }), // toUpload
        req({ status: 'submitted' }), // awaitingReview
        req({ status: 'accepted' }), // accepted
      ],
      NOW,
    );
    assert.equal(summary.total, 4);
    assert.equal(summary.toUpload, 2);
    assert.equal(summary.awaitingReview, 1);
    assert.equal(summary.accepted, 1);
    assert.equal(summary.overdue, 1);
  });

  it('orders action-needed requests first, then by due date', () => {
    const ordered = sortRequests([
      req({ status: 'accepted', createdAt: '2026-06-01T00:00:00.000Z' }),
      req({ status: 'submitted', createdAt: '2026-06-02T00:00:00.000Z' }),
      req({ status: 'requested', dueDate: '2026-06-20', createdAt: '2026-06-03T00:00:00.000Z' }),
      req({ status: 'returned', dueDate: '2026-06-12', createdAt: '2026-06-04T00:00:00.000Z' }),
      req({ status: 'requested', dueDate: '2026-06-09', createdAt: '2026-06-05T00:00:00.000Z' }),
    ]);
    assert.deepEqual(
      ordered.map((r) => r.status),
      ['returned', 'requested', 'requested', 'submitted', 'accepted'],
    );
    // The two requested entries are ordered by due date (09 before 20).
    assert.equal(ordered[1]?.dueDate, '2026-06-09');
    assert.equal(ordered[2]?.dueDate, '2026-06-20');
  });

  it('labels each status for the UI', () => {
    assert.equal(requestStatusLabel('requested'), 'Requested');
    assert.equal(requestStatusLabel('submitted'), 'Submitted — under review');
    assert.equal(requestStatusLabel('accepted'), 'Accepted');
    assert.equal(requestStatusLabel('returned'), 'Returned for follow-up');
  });
});
