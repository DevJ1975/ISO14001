import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  accessibilityCheckSchema,
  hardeningControlSchema,
  isPilotReady,
  observabilityEventSchema,
  pilotChecklistItemSchema,
  securityProbeSchema,
  summarizeHardeningControls,
} from '../src/app/core/domain';
import {
  demoAccessibilityChecks,
  demoHardeningControls,
  demoObservabilityEvents,
  demoPilotChecklist,
  demoSecurityProbes,
} from '../src/app/features/dashboard/phase-five-demo';

describe('phase 5 hardening and pilot readiness', () => {
  it('validates hardening controls and summarizes areas', () => {
    const controls = demoHardeningControls.map((control) => hardeningControlSchema.parse(control));
    const summary = summarizeHardeningControls(controls);

    assert.equal(controls.length, 6);
    assert.equal(summary.tenantIsolation, 1);
    assert.equal(summary.deployment, 1);
  });

  it('tracks tenant isolation security probes', () => {
    const probes = demoSecurityProbes.map((probe) => securityProbeSchema.parse(probe));

    assert.equal(probes[0]?.expectedDecision, 'deny');
    assert.equal(probes.some((probe) => probe.status === 'passed'), true);
  });

  it('tracks accessibility and observability readiness', () => {
    assert.equal(demoAccessibilityChecks.map((check) => accessibilityCheckSchema.parse(check)).length, 2);
    assert.equal(demoObservabilityEvents.map((event) => observabilityEventSchema.parse(event)).length, 2);
  });

  it('does not mark pilot ready until required controls pass', () => {
    const checklist = demoPilotChecklist.map((item) => pilotChecklistItemSchema.parse(item));

    assert.equal(isPilotReady(checklist), false);
    assert.equal(
      isPilotReady(checklist.map((item) => ({ ...item, status: 'passing' }))),
      true,
    );
  });

  it('applies the Soteria style theme tokens', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
    const dashboardCss = readFileSync(
      join(process.cwd(), 'src', 'app', 'features', 'dashboard', 'dashboard.component.css'),
      'utf8',
    );

    assert.match(css, /--primary-strong/);
    assert.match(css, /--accent-soft/);
    assert.match(dashboardCss, /shield|brand-mark|phase-five-section/);
  });
});
