import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeCorrectiveAction, type CorrectiveActionInput } from '../src/app/core/domain';

const base: CorrectiveActionInput = {
  clauseId: '8.1',
  clauseTitle: 'Operational planning & control',
  type: 'minorNc',
  title: 'Permit-to-work not closed out',
  description: 'Two completed hot-work permits were not signed off as closed.',
  systemic: false,
  relatedContext: [{ label: 'Incident: hot-work near-miss', detail: 'Permit step skipped under time pressure.' }],
};

const NOW = '2026-06-15T12:00:00.000Z';

/** All free-text fields the composer can emit, for guardrail / content assertions. */
function allText(result: ReturnType<typeof composeCorrectiveAction>): string[] {
  const texts: string[] = [result.summary, ...result.rootCauseHypotheses];
  if (result.containment) texts.push(result.containment);
  for (const step of result.correctiveActions) {
    texts.push(step.action, step.why);
    if (step.owner) texts.push(step.owner);
  }
  return texts;
}

test('composeCorrectiveAction returns root causes, a plan, summary and a deterministic stamp', () => {
  const result = composeCorrectiveAction(base, NOW);
  assert.ok(result.summary.length > 0);
  assert.ok(result.rootCauseHypotheses.length > 0);
  assert.ok(result.correctiveActions.length > 0);
  assert.equal(result.source, 'ruleBased');
  assert.equal(result.generatedAt, NOW);
  for (const step of result.correctiveActions) {
    assert.ok(step.action.length > 0);
    assert.ok(step.why.length > 0);
  }
});

test('a nonconformity proposes immediate containment; an OFI does not', () => {
  const nc = composeCorrectiveAction(base, NOW);
  assert.ok(nc.containment && nc.containment.length > 0, 'expected containment for an NC');

  const ofi = composeCorrectiveAction({ ...base, type: 'ofi' }, NOW);
  assert.equal(ofi.containment, undefined, 'an OFI is advisory and should not propose containment');
});

test('a systemic finding adds a cross-area extension step and a common-cause hypothesis', () => {
  const result = composeCorrectiveAction({ ...base, systemic: true }, NOW);
  assert.ok(
    result.rootCauseHypotheses.some((h) => /systemic|common cause/i.test(h)),
    'expected a common-cause hypothesis when systemic',
  );
  assert.ok(
    result.correctiveActions.some((s) => /other areas|shifts|sites/i.test(s.action)),
    'expected an extension step when systemic',
  );
});

test('related register context is woven into a root-cause hypothesis', () => {
  const result = composeCorrectiveAction(base, NOW);
  assert.ok(
    result.rootCauseHypotheses.some((h) => /related records/i.test(h)),
    'expected a hypothesis referencing related records',
  );
});

test('the plan always ends with an effectiveness-verification step (loop close-out)', () => {
  const result = composeCorrectiveAction(base, NOW);
  const last = result.correctiveActions.at(-1);
  assert.ok(last);
  assert.match(last.action, /verif/i);
});

test('deterministic: same input yields identical output', () => {
  const a = composeCorrectiveAction(base, NOW);
  const b = composeCorrectiveAction(base, NOW);
  assert.deepEqual(a, b);
});

test('empty-input safe: returns a baseline analysis and plan without throwing', () => {
  const empty: CorrectiveActionInput = { clauseId: '', clauseTitle: '', type: '' };
  const result = composeCorrectiveAction(empty, NOW);
  assert.equal(result.source, 'ruleBased');
  assert.ok(result.rootCauseHypotheses.length > 0, 'baseline root causes should still surface');
  assert.ok(result.correctiveActions.length > 0, 'baseline plan should still surface');
  // No related context and no description: no crash and no dangling references.
  assert.ok(!allText(result).some((t) => /undefined|null/.test(t)));
});

test('copyright guardrail: no verbatim requirement text (never the word "shall")', () => {
  // Cover several finding types so every code path's text is checked.
  for (const type of ['majorNc', 'minorNc', 'ofi'] as const) {
    const result = composeCorrectiveAction({ ...base, type, systemic: true }, NOW);
    for (const text of allText(result)) {
      assert.ok(!/\bshall\b/i.test(text), `corrective-action text appears to quote requirement text: "${text}"`);
    }
  }
});
