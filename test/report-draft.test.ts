import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeReportDraft, type ReportDraftInput } from '../src/app/core/domain';

const base: ReportDraftInput = {
  auditee: 'Northstar Components',
  criteria: 'ISO 45001:2018',
  auditTypeLabel: 'Surveillance',
  checklist: [
    { clauseId: '4', clauseTitle: 'Context', result: 'conform' },
    { clauseId: '6', clauseTitle: 'Planning', result: 'minorNc' },
    { clauseId: '8', clauseTitle: 'Operation', result: 'conform' },
    { clauseId: '9', clauseTitle: 'Performance', result: 'notStarted' },
  ],
  findings: [{ type: 'minorNc', clauseId: '6.2', clauseTitle: 'Objectives', status: 'open' }],
  evidenceCount: 5,
  overdueCapaCount: 0,
};

const NOW = '2026-06-15T12:00:00.000Z';

test('composeReportDraft fills every conclusion field and a recommendation', () => {
  const draft = composeReportDraft(base, NOW);
  assert.ok(draft.overallConformity.length > 0);
  assert.ok(draft.emsEffectivenessOpinion.length > 0);
  assert.ok(draft.criteriaMetStatement.length > 0);
  assert.equal(draft.source, 'ruleBased');
  assert.equal(draft.generatedAt, NOW);
});

test('a minor nonconformity drives a conditional recommendation and names the clause', () => {
  const draft = composeReportDraft(base, NOW);
  assert.equal(draft.recommendation, 'conditional');
  assert.match(draft.criteriaMetStatement, /6\.2/);
  assert.match(draft.overallConformity, /minor nonconformity/i);
});

test('a major nonconformity drives action-required', () => {
  const draft = composeReportDraft(
    { ...base, findings: [{ type: 'majorNc', clauseId: '8.1.2', clauseTitle: 'Controls', status: 'open' }] },
    NOW,
  );
  assert.equal(draft.recommendation, 'actionRequired');
  assert.match(draft.overallConformity, /major nonconformit/i);
  assert.match(draft.emsEffectivenessOpinion, /not yet demonstrably effective/i);
});

test('a clean audit recommends and reads as effective', () => {
  const clean: ReportDraftInput = {
    ...base,
    checklist: base.checklist.map((c) => ({ ...c, result: 'conform' as const })),
    findings: [],
  };
  const draft = composeReportDraft(clean, NOW);
  assert.equal(draft.recommendation, 'recommend');
  assert.match(draft.criteriaMetStatement, /No nonconformities were raised/i);
  assert.match(draft.emsEffectivenessOpinion, /operating effectively/i);
});

test('copyright guardrail: the draft carries no verbatim ISO requirement text', () => {
  const draft = composeReportDraft(base, NOW);
  for (const text of [draft.overallConformity, draft.emsEffectivenessOpinion, draft.criteriaMetStatement]) {
    assert.ok(!/\bshall\b/i.test(text), `draft text appears to quote requirement text: "${text}"`);
  }
});
