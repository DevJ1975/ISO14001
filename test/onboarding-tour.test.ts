import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NAV_DESTINATIONS } from '../src/app/core/shell/nav';
import {
  TOUR_DONE_KEY,
  TOUR_STEPS,
  TOUR_STEP_COUNT,
  clampStepIndex,
  isLastStep,
} from '../src/app/core/onboarding/tour-steps';

describe('guided tour steps', () => {
  it('covers the core workflow in order', () => {
    assert.deepEqual(
      TOUR_STEPS.map((s) => s.id),
      ['overview', 'audits', 'fieldwork', 'evidence', 'findings', 'report'],
    );
    assert.equal(TOUR_STEP_COUNT, TOUR_STEPS.length);
  });

  it('gives every step a title, body and stable id', () => {
    const ids = new Set<string>();
    for (const step of TOUR_STEPS) {
      assert.ok(step.id.length > 0, 'id present');
      assert.ok(step.title.length > 0, 'title present');
      assert.ok(step.body.length > 0, 'body present');
      assert.ok(!ids.has(step.id), `id ${step.id} is unique`);
      ids.add(step.id);
    }
  });

  it('points every routed step at a real nav destination', () => {
    const paths = new Set(NAV_DESTINATIONS.map((item) => item.path));
    for (const step of TOUR_STEPS) {
      if (step.route) assert.ok(paths.has(step.route), `${step.route} is a known nav path`);
    }
  });

  it('borrows the matching nav icon for each routed step', () => {
    for (const step of TOUR_STEPS) {
      if (!step.route) continue;
      const nav = NAV_DESTINATIONS.find((item) => item.path === step.route);
      assert.equal(step.icon, nav?.icon, `${step.id} reuses the nav icon`);
    }
  });

  it('persists under a dedicated localStorage key', () => {
    assert.equal(TOUR_DONE_KEY, 'soteria-guided-tour-done');
  });
});

describe('tour navigation helpers', () => {
  it('clamps indices into range', () => {
    assert.equal(clampStepIndex(-3, 6), 0);
    assert.equal(clampStepIndex(0, 6), 0);
    assert.equal(clampStepIndex(3, 6), 3);
    assert.equal(clampStepIndex(99, 6), 5);
  });

  it('handles non-finite and empty inputs safely', () => {
    assert.equal(clampStepIndex(Number.NaN, 6), 0);
    assert.equal(clampStepIndex(2, 0), 0);
  });

  it('truncates fractional indices', () => {
    assert.equal(clampStepIndex(2.9, 6), 2);
  });

  it('detects the last step', () => {
    assert.equal(isLastStep(5, 6), true);
    assert.equal(isLastStep(4, 6), false);
    assert.equal(isLastStep(0, 0), false);
    assert.equal(isLastStep(TOUR_STEP_COUNT - 1), true);
  });
});
