import assert from 'node:assert/strict';
import { test } from 'node:test';

import { editionFromCriteria, sharedClauseTitles, standardChecklist } from '../src/app/core/domain';

test('standardChecklist produces one row per clause in the standards model', () => {
  const rows = standardChecklist('ISO_45001_2018');
  const clauseIds = sharedClauseTitles[0].clauses.map((clause) => clause.clauseId);
  assert.equal(rows.length, clauseIds.length);
  assert.deepEqual(
    rows.map((row) => row.clauseId),
    clauseIds,
    'rows must follow the standard clause order',
  );
});

test('standardChecklist generalises to ISO 14001:2015 — one row per 14001 clause with non-empty questions', () => {
  const edition = sharedClauseTitles.find((e) => e.id === 'ISO_14001_2015');
  assert.ok(edition, 'ISO 14001:2015 edition must exist in the standards model');
  const rows = standardChecklist('ISO_14001_2015');
  assert.equal(rows.length, edition!.clauses.length);
  assert.deepEqual(
    rows.map((row) => row.clauseId),
    edition!.clauses.map((clause) => clause.clauseId),
    'rows must follow the 14001 clause order',
  );
  for (const row of rows) {
    assert.ok(row.question.length > 0, `clause ${row.clauseId} has no question`);
    assert.ok(row.clauseTitle.length > 0, `clause ${row.clauseId} has no title`);
  }
  // The environmental sub-clauses that replace the OH&S-specific ones must be present.
  const ids = new Set(rows.map((row) => row.clauseId));
  for (const clauseId of ['6.1.2', '6.1.3', '6.2', '8.2', '9.1.2']) {
    assert.ok(ids.has(clauseId), `14001 checklist missing clause ${clauseId}`);
  }
});

test('copyright guardrail: ISO 14001 questions, titles and guidance carry no requirement text', () => {
  for (const row of standardChecklist('ISO_14001_2015')) {
    assert.ok(!/\bshall\b/i.test(row.question), `14001 question quotes requirement text: ${row.question}`);
    assert.ok(!/\bshall\b/i.test(row.clauseTitle), `14001 title quotes requirement text: ${row.clauseTitle}`);
    assert.ok(!/\bshall\b/i.test(row.guidance ?? ''), `14001 guidance quotes requirement text: ${row.guidance}`);
  }
});

test('every generated row has a non-empty question and clause title', () => {
  for (const row of standardChecklist('ISO_45001_2018')) {
    assert.ok(row.question.length > 0, `clause ${row.clauseId} has no question`);
    assert.ok(row.clauseTitle.length > 0, `clause ${row.clauseId} has no title`);
  }
});

test('clauses covered by the field guide carry guidance', () => {
  // The field guide covers every standard clause, so all rows should have guidance.
  for (const row of standardChecklist('ISO_45001_2018')) {
    assert.ok(row.guidance && row.guidance.length > 0, `clause ${row.clauseId} has no guidance`);
  }
});

test('copyright guardrail: generated questions and guidance carry no requirement text', () => {
  for (const row of standardChecklist('ISO_45001_2018')) {
    assert.ok(!/\bshall\b/i.test(row.question), `question quotes requirement text: ${row.question}`);
    assert.ok(!/\bshall\b/i.test(row.guidance ?? ''), `guidance quotes requirement text: ${row.guidance}`);
  }
});

test('editionFromCriteria maps the human label to a standards edition id', () => {
  assert.equal(editionFromCriteria('ISO 45001:2018'), 'ISO_45001_2018');
  assert.equal(editionFromCriteria('ISO 45001:2026'), 'ISO_45001_2026');
  assert.equal(editionFromCriteria('ISO 14001:2015'), 'ISO_14001_2015');
  assert.equal(editionFromCriteria('whatever'), 'ISO_45001_2018');
});
