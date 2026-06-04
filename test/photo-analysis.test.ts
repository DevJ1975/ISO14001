import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  analysisCandidateToFinding,
  hasReviewableContent,
  normalizePhotoAnalysisPayload,
} from '../src/app/core/domain';

test('normalizePhotoAnalysisPayload keeps well-formed observations, tags, clause and statement', () => {
  const candidate = normalizePhotoAnalysisPayload({
    observations: ['Blocked fire exit', 'Extinguisher missing tag'],
    hazardTags: ['blocked egress', 'fire'],
    suggestedClauseId: '8.1.2',
    suggestedFindingStatement: 'Emergency egress route was obstructed by stored pallets.',
    suggestedType: 'majorNc',
  });
  assert.deepEqual(candidate.observations, ['Blocked fire exit', 'Extinguisher missing tag']);
  assert.deepEqual(candidate.hazardTags, ['blocked egress', 'fire']);
  assert.equal(candidate.suggestedClauseId, '8.1.2');
  assert.equal(candidate.suggestedType, 'majorNc');
  assert.ok(hasReviewableContent(candidate));
});

test('normalizePhotoAnalysisPayload tolerates junk: drops bad types, trims, de-dupes, defaults the grade', () => {
  const candidate = normalizePhotoAnalysisPayload({
    observations: ['  spill  ', 'spill', 42, '', null],
    hazardTags: 'not-an-array',
    suggestedClauseId: 'not a clause',
    suggestedType: 'wibble',
  });
  assert.deepEqual(candidate.observations, ['spill']); // trimmed + de-duped
  assert.deepEqual(candidate.hazardTags, []);
  assert.equal(candidate.suggestedClauseId, undefined); // rejected non-numeric clause
  assert.equal(candidate.suggestedType, 'ofi'); // safe default, never over-states severity
});

test('normalizePhotoAnalysisPayload is total on non-objects', () => {
  for (const raw of [null, undefined, 'x', 7, []]) {
    const candidate = normalizePhotoAnalysisPayload(raw);
    assert.deepEqual(candidate.observations, []);
    assert.deepEqual(candidate.hazardTags, []);
    assert.equal(candidate.suggestedType, 'ofi');
    assert.equal(hasReviewableContent(candidate), false);
  }
});

test('copyright guardrail: any string containing requirement language is stripped', () => {
  const candidate = normalizePhotoAnalysisPayload({
    observations: ['The organization shall provide guarding', 'Guard rail is damaged'],
    hazardTags: ['workers shall wear PPE', 'no PPE'],
    suggestedFindingStatement: 'The organization shall ensure controls are effective.',
  });
  assert.deepEqual(candidate.observations, ['Guard rail is damaged']);
  assert.deepEqual(candidate.hazardTags, ['no PPE']);
  assert.equal(candidate.suggestedFindingStatement, undefined);
});

test('analysisCandidateToFinding prefers the suggested statement and clause', () => {
  const finding = analysisCandidateToFinding({
    observations: ['x'],
    hazardTags: ['y'],
    suggestedClauseId: '6.1.2',
    suggestedFindingStatement: 'Hazard identification did not cover the new welding cell.',
    suggestedType: 'minorNc',
  });
  assert.equal(finding.clauseId, '6.1.2');
  assert.equal(finding.type, 'minorNc');
  assert.equal(finding.description, 'Hazard identification did not cover the new welding cell.');
});

test('analysisCandidateToFinding falls back to observations, then hazard tags, then a default', () => {
  const fromObs = analysisCandidateToFinding({
    observations: ['Oil on floor', 'No drip tray'],
    hazardTags: [],
    suggestedType: 'ofi',
  });
  assert.equal(fromObs.clauseId, '8.1.2'); // operational control default when no clause offered
  assert.equal(fromObs.description, 'Oil on floor; No drip tray');

  const fromTags = analysisCandidateToFinding({
    observations: [],
    hazardTags: ['slip hazard'],
    suggestedType: 'ofi',
  });
  assert.match(fromTags.description, /slip hazard/);

  const empty = analysisCandidateToFinding({ observations: [], hazardTags: [], suggestedType: 'ofi' });
  assert.ok(empty.description.length > 0); // never an empty finding
});

test('accepted findings carry no verbatim ISO requirement text', () => {
  const candidate = normalizePhotoAnalysisPayload({
    observations: ['Missing edge protection on mezzanine'],
    suggestedType: 'minorNc',
  });
  const finding = analysisCandidateToFinding(candidate);
  assert.ok(!/\bshall\b/i.test(finding.description));
});
