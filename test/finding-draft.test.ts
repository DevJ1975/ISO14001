import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeFindingDraft, type FindingDraftInput } from '../src/app/core/domain';

const base: FindingDraftInput = {
  clauseId: '6.2',
  clauseTitle: 'OH&S objectives and planning to achieve them',
  note: 'Objectives register shows 2 of 5 objectives without progress records for the current period.',
  result: 'minorNc',
  evidenceLabels: ['Interview with H&S manager', 'Objectives register screenshot'],
};

const NOW = '2026-06-15T12:00:00.000Z';

test('composeFindingDraft fills every field and stamps provenance', () => {
  const draft = composeFindingDraft(base, NOW);
  assert.ok(draft.draftStatement.length > 0);
  assert.ok(draft.requirementSummary.length > 0);
  assert.ok(draft.objectiveEvidence.length > 0);
  assert.ok(draft.gradingRationale.length > 0);
  assert.ok(Array.isArray(draft.rootCausePrompts) && draft.rootCausePrompts.length > 0);
  assert.ok(draft.rootCausePrompts.every((p) => typeof p === 'string' && p.length > 0));
  assert.equal(draft.source, 'ruleBased');
  assert.equal(draft.generatedAt, NOW);
});

test('the requirement summary and statement reference the clause id and title', () => {
  const draft = composeFindingDraft(base, NOW);
  assert.match(draft.requirementSummary, /6\.2/);
  assert.match(draft.draftStatement, /6\.2/);
});

test('the objective evidence carries the note and linked evidence labels', () => {
  const draft = composeFindingDraft(base, NOW);
  assert.match(draft.objectiveEvidence, /progress records/);
  assert.match(draft.objectiveEvidence, /Objectives register screenshot/);
});

test('suggestedType reflects the recorded result', () => {
  assert.equal(composeFindingDraft({ ...base, result: 'minorNc' }, NOW).suggestedType, 'minorNc');
  assert.equal(composeFindingDraft({ ...base, result: 'majorNc' }, NOW).suggestedType, 'majorNc');
  assert.equal(composeFindingDraft({ ...base, result: 'ofi' }, NOW).suggestedType, 'ofi');
});

test('a major result drives a major rationale; an OFI reads as advisory', () => {
  const major = composeFindingDraft({ ...base, result: 'majorNc' }, NOW);
  assert.match(major.gradingRationale, /major/i);
  const ofi = composeFindingDraft({ ...base, result: 'ofi' }, NOW);
  assert.match(ofi.draftStatement, /advisory/i);
  assert.match(ofi.gradingRationale, /OFI/i);
});

test('it still composes a draft when the clause is unknown and no note is given', () => {
  const draft = composeFindingDraft({ clauseId: '99', clauseTitle: 'Custom check', result: 'minorNc' }, NOW);
  assert.ok(draft.draftStatement.length > 0);
  assert.ok(draft.requirementSummary.length > 0);
  assert.ok(draft.objectiveEvidence.length > 0);
  assert.ok(draft.rootCausePrompts.length > 0);
});

test('copyright guardrail: the draft carries no verbatim ISO requirement text', () => {
  for (const result of ['minorNc', 'majorNc', 'ofi'] as const) {
    const draft = composeFindingDraft({ ...base, result }, NOW);
    const texts = [
      draft.draftStatement,
      draft.requirementSummary,
      draft.objectiveEvidence,
      draft.gradingRationale,
      ...draft.rootCausePrompts,
    ];
    for (const text of texts) {
      assert.ok(!/\bshall\b/i.test(text), `draft text appears to quote requirement text: "${text}"`);
    }
  }
});
