import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  baseAuditDays,
  calculateAuditDuration,
  canTransitionCertificate,
  certificateSchema,
  complaintAppealSchema,
  isComplaintOverdue,
  sampleSiteCount,
  selectSampleSites,
  transitionCertificate,
} from '../src/app/core/domain';

describe('audit-duration calculator (IAF MD 5)', () => {
  it('looks up base days by effective personnel band', () => {
    assert.equal(baseAuditDays(3), 1.5);
    assert.equal(baseAuditDays(50), 5);
    assert.equal(baseAuditDays(100000), 20); // saturates at the top band
  });

  it('applies complexity, stage and capped reductions with a breakdown', () => {
    const high = calculateAuditDuration({ effectivePersonnel: 50, complexity: 'high' });
    assert.equal(high.baseDays, 5);
    assert.equal(high.recommendedDays, 5);

    const low = calculateAuditDuration({ effectivePersonnel: 50, complexity: 'low' });
    assert.equal(low.recommendedDays, 3.5); // 5 × 0.7
    assert.ok(low.adjustments.some((a) => a.label.includes('low')));

    // reduction is capped at 30%
    const capped = calculateAuditDuration({ effectivePersonnel: 50, complexity: 'high', reductionPercent: 80 });
    assert.equal(capped.recommendedDays, 3.5); // 5 × 0.70
  });

  it('reduces time for surveillance and floors at half a day', () => {
    const surv = calculateAuditDuration({ effectivePersonnel: 50, complexity: 'high', stage: 'surveillance' });
    assert.ok(surv.recommendedDays < 5 && surv.recommendedDays >= 0.5);
    const tiny = calculateAuditDuration({ effectivePersonnel: 1, complexity: 'limited', stage: 'surveillance' });
    assert.equal(tiny.recommendedDays, 0.5);
  });
});

describe('multi-site √N sampling (IAF MD 1)', () => {
  it('samples ⌈√N⌉ initial sites, reduced for surveillance/recert', () => {
    assert.equal(sampleSiteCount(0), 0);
    assert.equal(sampleSiteCount(1), 1);
    assert.equal(sampleSiteCount(16, 'initial'), 4);
    assert.equal(sampleSiteCount(16, 'surveillance'), 3); // ⌈0.6·4⌉
    assert.equal(sampleSiteCount(25, 'recertification'), 4); // ⌈0.8·5⌉
  });

  it('selects a representative, reproducible spread including the first site', () => {
    const sites = ['HQ', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const result = selectSampleSites(sites, 'initial');
    assert.equal(result.count, 3); // ⌈√9⌉
    assert.equal(result.sampled.length, 3);
    assert.equal(result.sampled[0], 'HQ');
    assert.deepEqual(result.sampled, [...new Set(result.sampled)]); // no duplicates
    assert.ok(result.rationale.includes('3 of 9'));
  });

  it('samples all sites when the sample size meets the count', () => {
    const result = selectSampleSites(['A'], 'initial');
    assert.deepEqual(result.sampled, ['A']);
  });
});

describe('certificate lifecycle (ISO/IEC 17021-1 cl. 9.5–9.6)', () => {
  it('permits only legal transitions', () => {
    assert.equal(canTransitionCertificate('active', 'suspended'), true);
    assert.equal(canTransitionCertificate('suspended', 'active'), true);
    assert.equal(canTransitionCertificate('withdrawn', 'active'), false);
    assert.equal(canTransitionCertificate('expired', 'suspended'), false);
  });

  it('records an immutable history event on transition', () => {
    const cert = certificateSchema.parse({
      id: 'cert-1', certificateNumber: 'OHSMS-14001-0007', scopeStatement: 'Assembly of components',
      issuedAt: '2024-04-01', expiresAt: '2027-03-31', updatedAt: '2026-05-31T00:00:00.000Z',
    });
    const suspended = transitionCertificate(cert, 'suspended', 'Ava Brooks', '2026-05-31T10:00:00.000Z', 'Major NC overdue');
    assert.equal(suspended.status, 'suspended');
    assert.equal(suspended.history.length, 1);
    assert.equal(suspended.history[0].action, 'suspended');
    assert.equal(suspended.history[0].reason, 'Major NC overdue');
    assert.throws(() => transitionCertificate(suspended, 'reducedScope', 'x', 'y'));
  });
});

describe('complaints & appeals (ISO/IEC 17021-1 cl. 9.7–9.8)', () => {
  it('flags an open item past its due date as overdue', () => {
    const now = '2026-05-31T00:00:00.000Z';
    assert.equal(isComplaintOverdue({ status: 'underReview', dueDate: '2026-05-01' }, now), true);
    assert.equal(isComplaintOverdue({ status: 'underReview', dueDate: '2026-06-30' }, now), false);
    assert.equal(isComplaintOverdue({ status: 'closed', dueDate: '2026-05-01' }, now), false);
    assert.equal(isComplaintOverdue({ status: 'received' }, now), false);
  });

  it('validates a complaint with defaults', () => {
    const item = complaintAppealSchema.parse({
      id: 'c-1', subject: 'Noise from night shift', kind: 'complaint', updatedAt: '2026-05-31T00:00:00.000Z',
    });
    assert.equal(item.status, 'received');
    assert.equal(item.kind, 'complaint');
  });
});
