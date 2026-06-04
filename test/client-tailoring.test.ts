import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeClientTailoring, type ClientTailoringInput } from '../src/app/core/domain';

const base: ClientTailoringInput = {
  auditee: 'Northstar Components',
  sector: 'Manufacturing',
  headcount: 120,
  siteCount: 1,
  hazards: ['Machinery guarding on the press line', 'Noise exposure in assembly'],
  priorFindings: [{ clauseId: '8.1', clauseTitle: 'Operational planning', type: 'minorNc' }],
};

const NOW = '2026-06-15T12:00:00.000Z';

test('composeClientTailoring returns prioritised areas, notes and a deterministic stamp', () => {
  const result = composeClientTailoring(base, NOW);
  assert.ok(result.summary.length > 0);
  assert.ok(result.areas.length > 0);
  assert.equal(result.source, 'ruleBased');
  assert.equal(result.generatedAt, NOW);
  // Every area has a clause id, a title and at least one focus prompt.
  for (const area of result.areas) {
    assert.ok(area.clauseId.length > 0);
    assert.ok(area.clauseTitle.length > 0);
    assert.ok(['high', 'medium'].includes(area.priority));
  }
});

test('sector + hazard context prioritises operation (clause 8)', () => {
  const result = composeClientTailoring(base, NOW);
  const clause8 = result.areas.find((a) => a.clauseId === '8');
  assert.ok(clause8, 'expected clause 8 to be emphasised');
  assert.equal(clause8.priority, 'high');
  // Manufacturing rule also emphasises performance monitoring (clause 9).
  assert.ok(result.areas.some((a) => a.clauseId === '9'));
});

test('prior findings drive a high-priority follow-up on their clause', () => {
  const result = composeClientTailoring(base, NOW);
  const clause8 = result.areas.find((a) => a.clauseId === '8');
  assert.ok(clause8);
  assert.match(clause8.rationale, /follow-up|corrective action/i);
  assert.ok(result.riskNotes.some((n) => /prior findings/i.test(n)));
});

test('a large multi-site workforce emphasises consultation and monitoring', () => {
  const result = composeClientTailoring(
    { ...base, headcount: 600, siteCount: 4 },
    NOW,
  );
  assert.ok(result.areas.some((a) => a.clauseId === '5'), 'expected clause 5 emphasis for large workforce');
  assert.ok(result.areas.some((a) => a.clauseId === '9'), 'expected clause 9 emphasis for multi-site');
  assert.ok(result.riskNotes.some((n) => /600/.test(n)));
  assert.ok(result.riskNotes.some((n) => /4 sites/.test(n)));
});

test('deterministic: same input yields identical output', () => {
  const a = composeClientTailoring(base, NOW);
  const b = composeClientTailoring(base, NOW);
  assert.deepEqual(a, b);
});

test('empty-input safe: returns a baseline emphasis without throwing', () => {
  const empty: ClientTailoringInput = {
    auditee: '',
    sector: '',
    headcount: 0,
    siteCount: 0,
    hazards: [],
    priorFindings: [],
  };
  const result = composeClientTailoring(empty, NOW);
  assert.equal(result.source, 'ruleBased');
  assert.ok(result.areas.length > 0, 'baseline emphasis should still surface core clauses');
  assert.ok(result.areas.some((a) => a.clauseId === '6'));
  assert.ok(result.areas.some((a) => a.clauseId === '8'));
});

test('copyright guardrail: no verbatim requirement text (never the word "shall")', () => {
  const result = composeClientTailoring(base, NOW);
  const texts: string[] = [result.summary, ...result.riskNotes];
  for (const area of result.areas) {
    texts.push(area.clauseTitle, area.rationale, ...area.focusPrompts);
  }
  for (const text of texts) {
    assert.ok(!/\bshall\b/i.test(text), `tailoring text appears to quote requirement text: "${text}"`);
  }
});
