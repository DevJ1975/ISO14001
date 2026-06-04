import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeAuditAgenda, composeMeetingScripts, type AuditAgendaInput } from '../src/app/core/domain';

const base: AuditAgendaInput = {
  auditee: 'Northstar Components',
  criteria: 'ISO 45001:2018',
  auditTypeLabel: 'Surveillance',
  checklist: [
    { clauseId: '4', clauseTitle: 'Context', result: 'conform' },
    { clauseId: '6', clauseTitle: 'Planning', result: 'minorNc' },
    { clauseId: '8', clauseTitle: 'Operation', result: 'conform' },
    { clauseId: '9', clauseTitle: 'Performance', result: 'notStarted' },
  ],
  findings: [
    { type: 'minorNc', clauseId: '6.2', clauseTitle: 'Objectives', status: 'open' },
    { type: 'ofi', clauseId: '7.4', clauseTitle: 'Communication', status: 'open' },
  ],
};

const NOW = '2026-06-15T12:00:00.000Z';

/** Collect every generated string from the agenda + scripts for guardrail checks. */
function allStrings(input: AuditAgendaInput): string[] {
  const agenda = composeAuditAgenda(input, NOW);
  const scripts = composeMeetingScripts(input, NOW);
  return [
    agenda.title,
    agenda.scope,
    agenda.criteria,
    ...agenda.objectives,
    ...agenda.itinerary.flatMap((slot) => [slot.clause, slot.title, slot.duration, slot.focus]),
    ...agenda.samplingNotes,
    scripts.opening.heading,
    ...scripts.opening.talkingPoints,
    scripts.closing.heading,
    ...scripts.closing.talkingPoints,
  ];
}

test('composeAuditAgenda fills scope, criteria, objectives, an itinerary and sampling notes', () => {
  const agenda = composeAuditAgenda(base, NOW);
  assert.ok(agenda.title.length > 0);
  assert.ok(agenda.scope.length > 0);
  assert.equal(agenda.criteria, 'ISO 45001:2018');
  assert.ok(agenda.objectives.length > 0);
  assert.ok(agenda.objectives.every((o) => o.length > 0));
  assert.ok(agenda.itinerary.length > 0);
  assert.ok(agenda.itinerary.every((slot) => slot.focus.length > 0 && slot.duration.length > 0));
  assert.ok(agenda.samplingNotes.length > 0);
  assert.equal(agenda.source, 'ruleBased');
  assert.equal(agenda.generatedAt, NOW);
});

test('the agenda itinerary spans clause areas 4–10 and names the auditee and criteria', () => {
  const agenda = composeAuditAgenda(base, NOW);
  const clauses = agenda.itinerary.map((slot) => slot.clause);
  // Covered checklist areas (4, 6, 8, 9) plus the NC clause area (6) appear.
  for (const area of ['4', '6', '8', '9']) {
    assert.ok(clauses.includes(area), `itinerary should include clause area ${area}`);
  }
  assert.match(agenda.title, /Northstar Components/);
  assert.match(agenda.scope, /ISO 45001 clauses 4–10/);
  // The open nonconformity clause is reflected in the objectives and sampling notes.
  assert.ok(agenda.objectives.some((o) => /6\.2/.test(o)));
  assert.ok(agenda.samplingNotes.some((n) => /\b6\b/.test(n)));
});

test('composeMeetingScripts produces non-empty opening and closing scripts with required points', () => {
  const scripts = composeMeetingScripts(base, NOW);
  assert.equal(scripts.opening.heading, 'Opening meeting');
  assert.equal(scripts.closing.heading, 'Closing meeting');
  assert.ok(scripts.opening.talkingPoints.length > 0);
  assert.ok(scripts.closing.talkingPoints.length > 0);
  assert.equal(scripts.source, 'ruleBased');
  assert.equal(scripts.generatedAt, NOW);

  const opening = scripts.opening.talkingPoints.join(' ');
  assert.match(opening, /introduc/i);
  assert.match(opening, /confidential/i);
  assert.match(opening, /induction/i);
  assert.match(opening, /PPE/);
  assert.match(opening, /sampling/i);
  assert.match(opening, /graded/i);
  assert.match(opening, /closing meeting/i);

  const closing = scripts.closing.talkingPoints.join(' ');
  assert.match(closing, /30 days/);
  assert.match(closing, /90 days/);
  assert.match(closing, /acknowledge/i);
  assert.match(closing, /next steps/i);
});

test('the closing script reflects the finding counts by grade', () => {
  const scripts = composeMeetingScripts(base, NOW);
  const closing = scripts.closing.talkingPoints.join(' ');
  assert.match(closing, /1 minor nonconformity/);
  assert.match(closing, /1 opportunity for improvement/);
  assert.match(closing, /0 major nonconformities/);
});

test('a major nonconformity drives the closing recommendation toward action before conformity', () => {
  const scripts = composeMeetingScripts(
    { ...base, findings: [{ type: 'majorNc', clauseId: '8.1.2', clauseTitle: 'Controls', status: 'open' }] },
    NOW,
  );
  const closing = scripts.closing.talkingPoints.join(' ');
  assert.match(closing, /1 major nonconformity/);
  assert.match(closing, /correction and corrective action/i);
});

test('a clean audit reports no findings and recommends maintenance', () => {
  const clean: AuditAgendaInput = {
    ...base,
    checklist: base.checklist.map((c) => ({ ...c, result: 'conform' as const })),
    findings: [],
  };
  const scripts = composeMeetingScripts(clean, NOW);
  const closing = scripts.closing.talkingPoints.join(' ');
  assert.match(closing, /no nonconformities or opportunities for improvement/i);
  assert.match(closing, /met the audit criteria/i);
});

test('copyright guardrail: no generated agenda or script text quotes ISO requirement text', () => {
  for (const findings of [base.findings, [], [{ type: 'majorNc' as const, clauseId: '8.1.2', clauseTitle: 'Controls', status: 'open' }]]) {
    for (const text of allStrings({ ...base, findings })) {
      assert.ok(!/\bshall\b/i.test(text), `generated text appears to quote requirement text: "${text}"`);
    }
  }
});
