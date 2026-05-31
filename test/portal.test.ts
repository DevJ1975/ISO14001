import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canRespond,
  isAuditeeRole,
  portalSummary,
  toPortalFinding,
  visibleFindings,
  type PortalFinding,
} from '../src/app/core/portal/portal.logic';

const finding = (over: Partial<PortalFinding> & Pick<PortalFinding, 'id' | 'type' | 'status'>): PortalFinding => ({
  clauseId: '6.2',
  clauseTitle: 'Objectives',
  description: 'desc',
  createdAt: '2026-06-15T00:00:00.000Z',
  ...over,
});

describe('auditee portal logic', () => {
  it('recognises the auditee (clientViewer) role only', () => {
    assert.equal(isAuditeeRole('clientViewer'), true);
    assert.equal(isAuditeeRole('leadAuditor'), false);
    assert.equal(isAuditeeRole(undefined), false);
  });

  it('hides conformities and sorts visible findings newest-first', () => {
    const visible = visibleFindings([
      finding({ id: 'a', type: 'minorNc', status: 'open', createdAt: '2026-06-01T00:00:00.000Z' }),
      finding({ id: 'b', type: 'conformity', status: 'closed' }),
      finding({ id: 'c', type: 'majorNc', status: 'open', createdAt: '2026-06-10T00:00:00.000Z' }),
    ]);
    assert.deepEqual(visible.map((f) => f.id), ['c', 'a']); // conformity dropped, newest first
  });

  it('allows responses only on open/reopened/responded nonconformities', () => {
    assert.equal(canRespond({ type: 'majorNc', status: 'open' }), true);
    assert.equal(canRespond({ type: 'minorNc', status: 'reopened' }), true);
    assert.equal(canRespond({ type: 'minorNc', status: 'responded' }), true);
    assert.equal(canRespond({ type: 'minorNc', status: 'closed' }), false);
    assert.equal(canRespond({ type: 'ofi', status: 'open' }), false); // OFIs are advisory
    assert.equal(canRespond({ type: 'conformity', status: 'open' }), false);
  });

  it('projects only auditee-appropriate fields (no rationale/evidence/auditor identity)', () => {
    const projected = toPortalFinding({
      id: 'x',
      clauseId: '6.2',
      clauseTitle: 'Objectives',
      type: 'minorNc',
      description: 'gap',
      requirementSummary: 'cl. 6.2',
      status: 'open',
      createdAt: '2026-06-15T00:00:00.000Z',
    });
    assert.deepEqual(Object.keys(projected).sort(), [
      'acknowledgedAt',
      'clauseId',
      'clauseTitle',
      'createdAt',
      'description',
      'id',
      'requirementSummary',
      'responseText',
      'status',
      'type',
    ]);
  });

  it('summarises outstanding vs acknowledged findings', () => {
    const summary = portalSummary([
      finding({ id: 'a', type: 'majorNc', status: 'open' }),
      finding({ id: 'b', type: 'minorNc', status: 'responded', acknowledgedAt: '2026-06-16T00:00:00.000Z', responseText: 'fixing' }),
      finding({ id: 'c', type: 'ofi', status: 'open' }),
      finding({ id: 'd', type: 'conformity', status: 'closed' }),
    ]);
    assert.equal(summary.total, 3); // conformity excluded
    assert.equal(summary.major, 1);
    assert.equal(summary.minor, 1);
    assert.equal(summary.ofi, 1);
    assert.equal(summary.acknowledged, 1);
    assert.equal(summary.awaitingResponse, 1); // only the open major NC; OFI isn't actionable
  });
});
