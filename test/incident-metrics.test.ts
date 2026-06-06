import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  OSHA_DAY_COUNT_CAP,
  cappedDays,
  computeIncidentRates,
  formatIncidentReference,
  isDartCase,
  isLostTimeCase,
  isRecordableCase,
  nextIncidentReference,
  regulatorSubmissionStatus,
  reportingDeadline,
} from '../src/app/core/domain/incident-metrics';

describe('incident recordable-injury rates (cl. 9.1)', () => {
  // A representative case mix: one days-away case (6 days), one restricted case
  // (4 restricted days), one other-recordable, and one non-recordable near-miss.
  const incidents = [
    { oshaRecordable: true, oshaCaseClassification: 'daysAway' as const, daysAway: 6 },
    { oshaRecordable: true, oshaCaseClassification: 'restrictedOrTransfer' as const, daysRestricted: 4 },
    { oshaRecordable: true, oshaCaseClassification: 'otherRecordable' as const },
    { incidentType: 'nearMiss', injuryClassification: 'none' },
  ];

  it('counts recordable, DART and lost-time cases correctly', () => {
    const rates = computeIncidentRates(incidents, 200_000);
    assert.equal(rates.recordableCases, 3);
    assert.equal(rates.dartCases, 2); // days-away + restricted
    assert.equal(rates.lostTimeCases, 1); // only the days-away case
    assert.equal(rates.totalDaysAway, 6);
    assert.equal(rates.totalDaysRestricted, 4);
  });

  it('computes TRIR = recordable × 200,000 / hours', () => {
    const rates = computeIncidentRates(incidents, 200_000);
    // 3 recordable over exactly 200,000 hours → 3.0
    assert.equal(rates.trir, 3);
  });

  it('computes DART rate = DART cases × 200,000 / hours', () => {
    const rates = computeIncidentRates(incidents, 400_000);
    // 2 DART × 200,000 / 400,000 = 1.0
    assert.equal(rates.dartRate, 1);
  });

  it('computes LTIFR = lost-time × 1,000,000 / hours', () => {
    const rates = computeIncidentRates(incidents, 500_000);
    // 1 lost-time × 1,000,000 / 500,000 = 2.0
    assert.equal(rates.ltifr, 2);
  });

  it('computes the severity rate = total days away × 200,000 / hours', () => {
    const rates = computeIncidentRates(incidents, 200_000);
    // 6 days away × 200,000 / 200,000 = 6.0
    assert.equal(rates.severityRate, 6);
  });

  it('guards against zero / negative / invalid hours (no NaN or Infinity)', () => {
    for (const hours of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const rates = computeIncidentRates(incidents, hours as number);
      assert.equal(rates.hoursWorked, 0);
      assert.equal(rates.trir, 0);
      assert.equal(rates.dartRate, 0);
      assert.equal(rates.ltifr, 0);
      assert.equal(rates.severityRate, 0);
      // Counts are still reported even when hours are unknown.
      assert.equal(rates.recordableCases, 3);
    }
  });

  it('treats lostTime / riddor injury classifications as lost-time cases', () => {
    assert.equal(isLostTimeCase({ injuryClassification: 'lostTime' }), true);
    assert.equal(isLostTimeCase({ injuryClassification: 'riddor' }), true);
    assert.equal(isLostTimeCase({ injuryClassification: 'firstAid' }), false);
  });

  it('infers recordability from a case classification even without the boolean', () => {
    assert.equal(isRecordableCase({ oshaCaseClassification: 'otherRecordable' }), true);
    assert.equal(isRecordableCase({ oshaRecordable: true }), true);
    assert.equal(isRecordableCase({ incidentType: 'nearMiss' }), false);
  });

  it('counts a death as a DART case', () => {
    assert.equal(isDartCase({ oshaCaseClassification: 'death' }), true);
  });

  it('caps day counts at the OSHA 180-day limit and floors negatives to zero', () => {
    assert.equal(cappedDays(200), OSHA_DAY_COUNT_CAP);
    assert.equal(cappedDays(180), 180);
    assert.equal(cappedDays(5.9), 5);
    assert.equal(cappedDays(-3), 0);
    assert.equal(cappedDays(undefined), 0);
    // The cap also bounds the totals fed into the severity rate.
    const rates = computeIncidentRates([{ oshaRecordable: true, oshaCaseClassification: 'daysAway', daysAway: 500 }], 200_000);
    assert.equal(rates.totalDaysAway, 180);
  });
});

describe('incident reference generator', () => {
  it('formats a zero-padded reference for a year and sequence', () => {
    assert.equal(formatIncidentReference(2026, 1), 'INC-2026-001');
    assert.equal(formatIncidentReference(2026, 42), 'INC-2026-042');
    assert.equal(formatIncidentReference(2026, 1234), 'INC-2026-1234');
  });

  it('never issues a sequence below 1', () => {
    assert.equal(formatIncidentReference(2026, 0), 'INC-2026-001');
    assert.equal(formatIncidentReference(2026, -5), 'INC-2026-001');
  });

  it('returns the next free sequence for the current year', () => {
    const now = new Date('2026-06-06T00:00:00.000Z');
    assert.equal(nextIncidentReference([], now), 'INC-2026-001');
    assert.equal(nextIncidentReference(['INC-2026-001', 'INC-2026-002'], now), 'INC-2026-003');
    // Ignores other years and malformed/blank references.
    assert.equal(nextIncidentReference(['INC-2025-009', undefined, 'X', 'INC-2026-004'], now), 'INC-2026-005');
  });
});

describe('statutory reporting deadlines', () => {
  const occurredAt = '2026-06-01T08:00:00.000Z';

  it('OSHA: a fatality is reportable within 8 hours (1904.39)', () => {
    const d = reportingDeadline({ incidentType: 'fatality', occurredAt }, 'US');
    assert.equal(d.reportable, true);
    assert.equal(d.regulator, 'OSHA');
    assert.equal(d.windowHours, 8);
    assert.equal(d.dueAt, '2026-06-01T16:00:00.000Z');
  });

  it('OSHA: a severe injury (hospitalization/amputation/eye) is reportable within 24 hours', () => {
    const d = reportingDeadline({ incidentType: 'injury', reportableToRegulator: true, occurredAt }, 'US');
    assert.equal(d.reportable, true);
    assert.equal(d.windowHours, 24);
    assert.equal(d.dueAt, '2026-06-02T08:00:00.000Z');
  });

  it('OSHA: an ordinary recordable injury is not a fixed-window report', () => {
    const d = reportingDeadline({ incidentType: 'injury', occurredAt }, 'US');
    assert.equal(d.reportable, false);
    assert.equal(d.regulator, 'OSHA');
  });

  it('RIDDOR: deaths and specified injuries are reported without delay', () => {
    const d = reportingDeadline({ incidentType: 'fatality', occurredAt }, 'UK');
    assert.equal(d.reportable, true);
    assert.equal(d.regulator, 'RIDDOR');
    assert.equal(d.withoutDelay, true);
  });

  it('RIDDOR: a flagged reportable case uses the statutory window', () => {
    const d = reportingDeadline({ incidentType: 'injury', reportableToRegulator: true, occurredAt }, 'UK');
    assert.equal(d.reportable, true);
    assert.equal(d.windowHours, 24);
  });

  it('other jurisdictions surface a generic reportable signal from the flag only', () => {
    assert.equal(reportingDeadline({ reportableToRegulator: true }, 'AU').reportable, true);
    assert.equal(reportingDeadline({ reportableToRegulator: true }, 'AU').regulator, 'regulator');
    assert.equal(reportingDeadline({ incidentType: 'fatality' }, 'AU').reportable, false);
  });
});

describe('regulator submission status', () => {
  const occurredAt = '2026-06-01T08:00:00.000Z';

  it('is notReportable for non-reportable incidents', () => {
    assert.equal(regulatorSubmissionStatus({ incidentType: 'injury', occurredAt }, 'US'), 'notReportable');
  });

  it('is submitted once a regulator date is recorded', () => {
    const status = regulatorSubmissionStatus(
      { incidentType: 'fatality', occurredAt, reportedToRegulatorAt: '2026-06-01T10:00:00.000Z' },
      'US',
    );
    assert.equal(status, 'submitted');
  });

  it('is pending while inside the fixed window', () => {
    // 5 hours after an 8-hour fatality window opens, still pending.
    const now = new Date('2026-06-01T13:00:00.000Z');
    assert.equal(regulatorSubmissionStatus({ incidentType: 'injury', reportableToRegulator: true, occurredAt }, 'US', now), 'pending');
  });

  it('is overdue past the window with no submission', () => {
    const now = new Date('2026-06-03T08:00:00.000Z');
    assert.equal(regulatorSubmissionStatus({ incidentType: 'fatality', occurredAt }, 'US', now), 'overdue');
  });

  it('treats an unsubmitted without-delay RIDDOR case as overdue immediately', () => {
    const now = new Date('2026-06-01T08:30:00.000Z');
    assert.equal(regulatorSubmissionStatus({ incidentType: 'fatality', occurredAt }, 'UK', now), 'overdue');
  });
});
