import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COPILOT_SUGGESTIONS, answerFromFieldGuide } from '../src/app/core/domain';

test('answers a clause-number question from the field guide', () => {
  const a = answerFromFieldGuide('What should I check for 6.1.2 hazard identification?');
  assert.equal(a.source, 'fieldGuide');
  assert.ok(a.answer.length > 0);
  assert.ok(a.clauseRefs.some((r) => r.clauseId === '6.1.2'));
  assert.match(a.answer, /6\.1\.2/);
});

test('answers a topical question by keyword overlap', () => {
  const a = answerFromFieldGuide('How do I audit worker consultation and participation?');
  assert.ok(a.clauseRefs.some((r) => r.clauseId === '5.4'));
});

test('grading questions surface the grading guide', () => {
  const a = answerFromFieldGuide('When is a finding a major nonconformity versus a minor one?');
  assert.match(a.answer.toLowerCase(), /major/);
  assert.match(a.answer.toLowerCase(), /minor/);
});

test('an unmatched question returns a helpful fallback with no clause refs', () => {
  const a = answerFromFieldGuide('zzzzzz qqqqqq');
  assert.equal(a.clauseRefs.length, 0);
  assert.match(a.answer, /clause number/i);
});

test('copyright guardrail: answers carry no verbatim ISO requirement text', () => {
  assert.ok(COPILOT_SUGGESTIONS.length > 0);
  for (const q of ['6.1.2', 'competence 7.2', 'management review 9.3', ...COPILOT_SUGGESTIONS]) {
    const a = answerFromFieldGuide(q);
    assert.ok(!/\bshall\b/i.test(a.answer), `answer appears to quote requirement text: ${a.answer}`);
  }
});
