import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computePortfolioAnalytics,
  type PortfolioAnalyticsInput,
} from '../src/app/core/domain/portfolio-analytics';

const NOW = '2026-06-04T12:00:00.000Z';

function sampleInput(overrides: Partial<PortfolioAnalyticsInput> = {}): PortfolioAnalyticsInput {
  return {
    now: NOW,
    audits: [
      { id: 'a1', status: 'fieldwork', auditType: 'surveillance' },
      { id: 'a2', status: 'reporting', auditType: 'internal' },
      { id: 'a3', status: 'fieldwork' },
      { id: 'a4', status: 'closed', auditType: 'surveillance' },
    ],
    findings: [
      { auditId: 'a1', clauseId: '8.1.2', type: 'majorNc', status: 'open', createdAt: '2026-05-10T09:00:00.000Z' },
      { auditId: 'a1', clauseId: '6.1', type: 'minorNc', status: 'closed', createdAt: '2026-05-22T09:00:00.000Z' },
      { auditId: 'a2', clauseId: '9.2', type: 'minorNc', status: 'verified', createdAt: '2026-06-01T09:00:00.000Z' },
      { auditId: 'a2', clauseId: '7.5', type: 'ofi', status: 'open', createdAt: '2026-06-02T09:00:00.000Z' },
      { auditId: 'a1', clauseId: '4.1', type: 'conformity', status: 'closed', createdAt: '2026-05-09T09:00:00.000Z' },
    ],
    capas: [
      { dueDate: '2026-05-01T00:00:00.000Z', status: 'open' }, // overdue (past + not verified)
      { dueDate: '2026-12-01T00:00:00.000Z', status: 'inProgress' }, // open
      { dueDate: '2026-05-01T00:00:00.000Z', status: 'verified' }, // verified, not overdue
      { status: 'overdue' }, // explicitly overdue
    ],
    internalAudits: [
      { status: 'completed', plannedDate: '2026-04-01' },
      { status: 'planned', plannedDate: '2026-05-01' }, // overdue (past planned date)
      { status: 'planned', plannedDate: '2026-09-01' }, // future, not overdue
    ],
    plannedAudits: [{ status: 'completed' }, { status: 'planned' }, { status: 'inProgress' }],
    ...overrides,
  };
}

describe('computePortfolioAnalytics', () => {
  it('counts audits by status and type', () => {
    const result = computePortfolioAnalytics(sampleInput());
    assert.equal(result.auditCount, 4);
    assert.deepEqual(result.auditsByStatus, [
      { key: 'fieldwork', count: 2 },
      { key: 'closed', count: 1 },
      { key: 'reporting', count: 1 },
    ]);
    // a3 has no type -> bucketed as 'unknown'; surveillance leads.
    assert.deepEqual(result.auditsByType, [
      { key: 'surveillance', count: 2 },
      { key: 'internal', count: 1 },
      { key: 'unknown', count: 1 },
    ]);
  });

  it('breaks down findings by grade and open/closed NCs', () => {
    const { findings } = computePortfolioAnalytics(sampleInput());
    assert.equal(findings.total, 5);
    assert.equal(findings.majorNc, 1);
    assert.equal(findings.minorNc, 2);
    assert.equal(findings.ofi, 1);
    assert.equal(findings.conformity, 1);
    // NCs = 3 (1 major + 2 minor); closed = the 'closed' minor + 'verified' minor = 2; open = 1.
    assert.equal(findings.openNc, 1);
    assert.equal(findings.closedNc, 2);
  });

  it('classifies CAPAs into verified / open / overdue', () => {
    const { capas } = computePortfolioAnalytics(sampleInput());
    assert.equal(capas.total, 4);
    assert.equal(capas.verified, 1);
    assert.equal(capas.overdue, 2);
    assert.equal(capas.open, 1);
  });

  it('summarises programme health including overdue internal audits', () => {
    const { programme } = computePortfolioAnalytics(sampleInput());
    assert.equal(programme.plannedTotal, 3);
    assert.equal(programme.plannedCompleted, 1);
    assert.equal(programme.internalTotal, 3);
    assert.equal(programme.internalCompleted, 1);
    assert.equal(programme.internalOverdue, 1);
  });

  it('distributes findings across clause groups 4–10 in clause order', () => {
    const { findingsByClauseGroup } = computePortfolioAnalytics(sampleInput());
    assert.deepEqual(findingsByClauseGroup, [
      { key: '4', count: 1 },
      { key: '6', count: 1 },
      { key: '7', count: 1 },
      { key: '8', count: 1 },
      { key: '9', count: 1 },
    ]);
  });

  it('buckets a non-4-10 clause into "other"', () => {
    const result = computePortfolioAnalytics(
      sampleInput({
        findings: [
          { clauseId: '3.2', type: 'minorNc', status: 'open' },
          { clauseId: '5.1', type: 'minorNc', status: 'open' },
        ],
      }),
    );
    assert.deepEqual(result.findingsByClauseGroup, [
      { key: '5', count: 1 },
      { key: 'other', count: 1 },
    ]);
  });

  it('builds a chronological by-month trend and skips undated findings', () => {
    const { findingsByMonth } = computePortfolioAnalytics(sampleInput());
    assert.deepEqual(findingsByMonth, [
      { key: '2026-05', count: 3 },
      { key: '2026-06', count: 2 },
    ]);

    const undated = computePortfolioAnalytics(
      sampleInput({ findings: [{ clauseId: '8.1', type: 'majorNc', status: 'open' }] }),
    );
    assert.deepEqual(undated.findingsByMonth, []);
  });

  it('is safe on empty input', () => {
    const result = computePortfolioAnalytics({ audits: [], findings: [], capas: [], now: NOW });
    assert.equal(result.auditCount, 0);
    assert.deepEqual(result.auditsByStatus, []);
    assert.deepEqual(result.auditsByType, []);
    assert.equal(result.findings.total, 0);
    assert.equal(result.findings.openNc, 0);
    assert.equal(result.capas.total, 0);
    assert.deepEqual(result.programme, {
      plannedTotal: 0,
      plannedCompleted: 0,
      internalTotal: 0,
      internalCompleted: 0,
      internalOverdue: 0,
    });
    assert.deepEqual(result.findingsByClauseGroup, []);
    assert.deepEqual(result.findingsByMonth, []);
    assert.equal(result.generatedAt, NOW);
  });

  it('is deterministic and JSON-serialisable', () => {
    const input = sampleInput();
    const a = computePortfolioAnalytics(input);
    const b = computePortfolioAnalytics(input);
    assert.deepEqual(a, b);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  });
});
