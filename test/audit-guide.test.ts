import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUDIT_METHODOLOGY,
  CLAUSE_FIELD_GUIDE,
  GRADING_GUIDE,
  clauseGuideFor,
  guideClauseIds,
  sharedClauseTitles,
} from '../src/app/core/domain';

test('field guide covers every ISO 14001 clause in the standards model', () => {
  const standardClauseIds = new Set(sharedClauseTitles[0].clauses.map((clause) => clause.clauseId));
  const guideIds = new Set(guideClauseIds());
  for (const clauseId of standardClauseIds) {
    assert.ok(guideIds.has(clauseId), `missing field-guide entry for clause ${clauseId}`);
  }
});

test('every clause guide entry is fully populated with the four lenses', () => {
  for (const entry of CLAUSE_FIELD_GUIDE) {
    assert.ok(entry.purpose.length > 0, `clause ${entry.clauseId} has no purpose`);
    assert.ok(entry.whatToLookFor.length > 0, `clause ${entry.clauseId} has no whatToLookFor`);
    assert.ok(entry.evidenceToRequest.length > 0, `clause ${entry.clauseId} has no evidenceToRequest`);
    assert.ok(entry.questionsToAsk.length > 0, `clause ${entry.clauseId} has no questionsToAsk`);
    assert.ok(entry.typicalNonconformities.length > 0, `clause ${entry.clauseId} has no typicalNonconformities`);
  }
});

test('clauseGuideFor resolves a known clause and is undefined for unknown', () => {
  const guide = clauseGuideFor('9.1');
  assert.equal(guide?.clauseId, '9.1');
  assert.ok(guide!.questionsToAsk.length > 0);
  assert.equal(clauseGuideFor('99.9'), undefined);
});

test('methodology lists ordered stages with practical steps', () => {
  assert.ok(AUDIT_METHODOLOGY.length >= 6);
  for (const stage of AUDIT_METHODOLOGY) {
    assert.ok(stage.steps.length > 0, `stage ${stage.id} has no steps`);
  }
  const ids = AUDIT_METHODOLOGY.map((stage) => stage.id);
  assert.equal(new Set(ids).size, ids.length, 'stage ids must be unique');
});

test('grading guide aligns with the major/minor/OFI engine', () => {
  const grades = GRADING_GUIDE.map((g) => g.grade).sort();
  assert.deepEqual(grades, ['majorNc', 'minorNc', 'ofi']);
});

test('copyright guardrail: guide carries no verbatim ISO requirement text', () => {
  // The guide is original guidance; it must not quote the standard. "shall" is the
  // hallmark of ISO requirement text, so it must never appear in guide content.
  const haystacks: string[] = [];
  for (const entry of CLAUSE_FIELD_GUIDE) {
    haystacks.push(
      entry.purpose,
      ...entry.whatToLookFor,
      ...entry.evidenceToRequest,
      ...entry.questionsToAsk,
      ...entry.typicalNonconformities,
    );
  }
  for (const stage of AUDIT_METHODOLOGY) {
    haystacks.push(stage.summary, ...stage.steps, stage.tip ?? '');
  }
  for (const text of haystacks) {
    assert.ok(!/\bshall\b/i.test(text), `guide text appears to quote requirement text: "${text}"`);
  }
});
