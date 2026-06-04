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
  assert.equal(editionFromCriteria('whatever'), 'ISO_45001_2018');
});
