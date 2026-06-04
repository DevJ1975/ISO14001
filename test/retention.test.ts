import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeRetention,
  DEFAULT_RETENTION_CATEGORIES,
  DEFAULT_REVIEW_WINDOW_DAYS,
  type RetentionCategoryDef,
  type RetentionInput,
} from '../src/app/core/domain/retention';

const NOW = '2026-06-04T12:00:00.000Z';

function recordById(summary: ReturnType<typeof computeRetention>, id: string) {
  const r = summary.records.find((x) => x.id === id);
  assert.ok(r, `expected record ${id}`);
  return r;
}

describe('computeRetention', () => {
  it('computes retain-until as base date plus the default retention period (years)', () => {
    const summary = computeRetention({ baseDate: '2024-06-04T00:00:00.000Z' }, NOW);
    const auditReport = recordById(summary, 'auditReport'); // 6-year default
    assert.equal(auditReport.retentionYears, 6);
    assert.equal(auditReport.retainUntil, '2030-06-04T00:00:00.000Z');

    const programme = recordById(summary, 'programmeRecords'); // 3-year default
    assert.equal(programme.retentionYears, 3);
    assert.equal(programme.retainUntil, '2027-06-04T00:00:00.000Z');
  });

  it('marks a record active when retain-until is well in the future', () => {
    const summary = computeRetention({ baseDate: NOW }, NOW);
    const auditReport = recordById(summary, 'auditReport');
    assert.equal(auditReport.disposition, 'active');
    assert.ok((auditReport.daysRemaining ?? 0) > DEFAULT_REVIEW_WINDOW_DAYS);
  });

  it('marks a record eligibleForDisposal once retain-until has elapsed', () => {
    // Base 7 years ago, 6-year retention => retain-until ~1 year in the past.
    const summary = computeRetention({ baseDate: '2019-06-04T00:00:00.000Z' }, NOW);
    const auditReport = recordById(summary, 'auditReport');
    assert.equal(auditReport.disposition, 'eligibleForDisposal');
    assert.ok((auditReport.daysRemaining ?? 0) < 0);
    assert.equal(summary.eligibleForDisposalCount > 0, true);
  });

  it('marks a record dueForReview when retain-until falls within the review window', () => {
    // retain-until 30 days from now: base = now - (6 years) + 30 days.
    const base = new Date(Date.UTC(2020, 6, 4)); // 2020-07-04, 6yr => 2026-07-04 (~30 days out from 2026-06-04)
    const summary = computeRetention({ baseDate: base.toISOString() }, NOW);
    const auditReport = recordById(summary, 'auditReport');
    assert.equal(auditReport.disposition, 'dueForReview');
    const days = auditReport.daysRemaining ?? -1;
    assert.ok(days >= 0 && days <= DEFAULT_REVIEW_WINDOW_DAYS, `days=${days}`);
    assert.equal(summary.dueForReviewCount > 0, true);
  });

  it('respects an explicit reviewWindowDays threshold boundary', () => {
    const base = new Date(Date.UTC(2020, 6, 4)); // retain-until 2026-07-04, ~30 days out
    const tight = computeRetention({ baseDate: base.toISOString(), reviewWindowDays: 10 }, NOW);
    assert.equal(recordById(tight, 'auditReport').disposition, 'active'); // 30 > 10
    const wide = computeRetention({ baseDate: base.toISOString(), reviewWindowDays: 60 }, NOW);
    assert.equal(recordById(wide, 'auditReport').disposition, 'dueForReview'); // 30 <= 60
  });

  it('legal hold overrides disposal even when retain-until has elapsed', () => {
    const input: RetentionInput = {
      baseDate: '2010-01-01T00:00:00.000Z', // long past
      overrides: { auditReport: { legalHold: true } },
    };
    const summary = computeRetention(input, NOW);
    const auditReport = recordById(summary, 'auditReport');
    assert.equal(auditReport.legalHold, true);
    assert.equal(auditReport.disposition, 'onLegalHold');
    assert.equal(summary.onLegalHoldCount, 1);
    // The held record must not be counted as eligible for disposal.
    assert.equal(summary.eligibleForDisposalCount, summary.records.filter((r) => r.id !== 'auditReport' && r.disposition === 'eligibleForDisposal').length);
  });

  it('applies a per-category years override and flags it as customised', () => {
    const summary = computeRetention(
      { baseDate: '2024-06-04T00:00:00.000Z', overrides: { auditReport: { years: 10 } } },
      NOW,
    );
    const auditReport = recordById(summary, 'auditReport');
    assert.equal(auditReport.retentionYears, 10);
    assert.equal(auditReport.customised, true);
    assert.equal(auditReport.retainUntil, '2034-06-04T00:00:00.000Z');
    // An override equal to the default is not "customised".
    const same = computeRetention(
      { baseDate: '2024-06-04T00:00:00.000Z', overrides: { auditReport: { years: 6 } } },
      NOW,
    );
    assert.equal(recordById(same, 'auditReport').customised, false);
  });

  it('handles a missing/unparseable base date safely (null dates, active or held)', () => {
    const missing = computeRetention({}, NOW);
    assert.equal(missing.baseDateMissing, true);
    assert.equal(missing.baseDate, null);
    for (const r of missing.records) {
      assert.equal(r.retainUntil, null);
      assert.equal(r.daysRemaining, null);
      assert.equal(r.disposition, 'active');
    }

    const bad = computeRetention({ baseDate: 'not-a-date' }, NOW);
    assert.equal(bad.baseDateMissing, true);

    // A legal hold still applies with no base date.
    const held = computeRetention({ overrides: { workingPapers: { legalHold: true } } }, NOW);
    assert.equal(recordById(held, 'workingPapers').disposition, 'onLegalHold');
  });

  it('covers every default category exactly once', () => {
    const summary = computeRetention({ baseDate: NOW }, NOW);
    assert.equal(summary.records.length, DEFAULT_RETENTION_CATEGORIES.length);
    const ids = new Set(summary.records.map((r) => r.id));
    assert.equal(ids.size, DEFAULT_RETENTION_CATEGORIES.length);
    for (const cat of DEFAULT_RETENTION_CATEGORIES) {
      assert.ok(ids.has(cat.id));
    }
  });

  it('accepts a custom category catalogue', () => {
    const categories: RetentionCategoryDef[] = [
      { id: 'auditReport', label: 'Only one', defaultYears: 1, reference: 'cl. 7.5' },
    ];
    const summary = computeRetention({ baseDate: '2024-06-04T00:00:00.000Z', categories }, NOW);
    assert.equal(summary.records.length, 1);
    assert.equal(summary.records[0].retainUntil, '2025-06-04T00:00:00.000Z');
    assert.equal(summary.records[0].disposition, 'eligibleForDisposal');
  });

  it('handles a leap-day base date without rolling into the next month', () => {
    // 2024-02-29 + 1 year should clamp to 2025-02-28, not 2025-03-01.
    const summary = computeRetention(
      { baseDate: '2024-02-29T00:00:00.000Z', categories: [{ id: 'auditReport', label: 'x', defaultYears: 1, reference: 'r' }] },
      NOW,
    );
    assert.equal(summary.records[0].retainUntil, '2025-02-28T00:00:00.000Z');
  });

  it('is deterministic and JSON-serialisable for a fixed input and now', () => {
    const input: RetentionInput = {
      baseDate: '2023-06-04T00:00:00.000Z',
      overrides: { workingPapers: { legalHold: true }, auditReport: { years: 8 } },
    };
    const a = computeRetention(input, NOW);
    const b = computeRetention(input, NOW);
    assert.deepEqual(a, b);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
    assert.equal(a.generatedAt, NOW);
  });
});
