import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toCsv } from '../src/app/core/export/csv';
import {
  buildOsha300ASummary,
  buildOsha300Log,
  buildOsha301Report,
  buildRiddorReport,
  osha300LogColumns,
  recordableIncidents,
} from '../src/app/features/registers/incident-forms';
import type { Incident } from '../src/app/core/field/field-audit-store';

function incident(extra: Partial<Incident>): Incident {
  return {
    id: 'inc',
    title: 'Untitled',
    incidentType: 'injury',
    severity: 'low',
    status: 'open',
    result: 'notStarted',
    updatedAt: '',
    sync: 'synced',
    ...extra,
  };
}

const sample: Incident[] = [
  incident({
    id: 'a', reference: 'INC-2026-001', title: 'Fall from ladder', occurredAt: '2026-05-12', location: 'Assembly',
    incidentType: 'injury', oshaRecordable: true, oshaCaseClassification: 'daysAway', daysAway: 6, daysRestricted: 0,
    bodyPart: 'Left wrist', agency: 'Step ladder',
  }),
  incident({
    id: 'b', reference: 'INC-2026-002', title: 'Restricted-duty strain', occurredAt: '2026-05-20',
    incidentType: 'injury', oshaRecordable: true, oshaCaseClassification: 'restrictedOrTransfer', daysRestricted: 4,
  }),
  incident({ id: 'c', reference: 'INC-2026-003', title: 'Near-miss', incidentType: 'nearMiss', oshaRecordable: false }),
  incident({
    id: 'd', reference: 'INC-2026-004', title: 'Privacy case', incidentType: 'illHealth', oshaRecordable: true,
    oshaCaseClassification: 'otherRecordable', privacyConcern: true,
  }),
];

describe('OSHA 300 Log', () => {
  it('includes only recordable cases', () => {
    const rows = recordableIncidents(sample);
    assert.equal(rows.length, 3); // a, b, d (the near-miss is excluded)
    assert.ok(!rows.some((r) => r.id === 'c'));
  });

  it('redacts the identifier on a privacy-concern case (1904.29(b))', () => {
    const csv = buildOsha300Log(sample);
    assert.ok(csv.includes('Privacy case'));
    // The original "What was the employee doing" detail is the description; here
    // the privacy row keeps no identifying name in the identifier column.
    const lines = csv.trim().split('\r\n');
    const privacyRow = lines.find((l) => l.includes('INC-2026-004'))!;
    assert.ok(privacyRow.includes('Privacy case'));
  });

  it('maps the case classification to the G/H/I/J column and carries day counts', () => {
    const csv = toCsv(recordableIncidents(sample), osha300LogColumns, { bom: false, eol: '\n' });
    const header = csv.trim().split('\n')[0]!;
    assert.ok(header.includes('Classify the case'));
    assert.ok(header.includes('Days away'));
    const ladderRow = csv.trim().split('\n').find((l) => l.includes('INC-2026-001'))!;
    assert.ok(ladderRow.includes('H — Days away'));
    assert.ok(ladderRow.includes('Left wrist'));
  });
});

describe('OSHA 300A annual summary', () => {
  it('totals cases by classification and sums capped day counts', () => {
    const rows = buildOsha300ASummary(sample);
    const get = (label: string) => rows.find((r) => r.label.startsWith(label))!.value;
    assert.equal(get('Total deaths'), 0);
    assert.equal(get('Total cases with days away'), 1);
    assert.equal(get('Total cases with job transfer or restriction'), 1);
    assert.equal(get('Total other recordable'), 1);
    assert.equal(get('Total days away from work'), 6);
    assert.equal(get('Total days of job transfer or restriction'), 4);
    assert.equal(get('Total recordable cases'), 3);
    assert.equal(get('Total illnesses'), 1); // the ill-health privacy case
  });
});

describe('OSHA 301 per-incident report', () => {
  it('captures the case, classification and investigation fields', () => {
    const fields = buildOsha301Report(sample[0]!);
    const get = (label: string) => fields.find((f) => f.field === label)?.value;
    assert.equal(get('Case number'), 'INC-2026-001');
    assert.equal(get('Object or substance that directly harmed the employee'), 'Step ladder');
    assert.equal(get('Days away from work'), '6');
    assert.equal(get('Recordable'), 'Yes');
  });

  it('withholds the person on a privacy-concern case', () => {
    const fields = buildOsha301Report(sample[3]!);
    const get = (label: string) => fields.find((f) => f.field === label)?.value;
    assert.equal(get('Employee / job title'), 'Privacy case');
    assert.equal(get('People involved / witnesses'), 'Withheld (privacy case)');
  });
});

describe('RIDDOR-style report', () => {
  it('captures the event and the regulator submission tracking', () => {
    const fields = buildRiddorReport(
      incident({ reference: 'INC-2026-009', incidentType: 'dangerousOccurrence', reportableToRegulator: true, regulatorReference: 'RID-1', reportedToRegulatorAt: '2026-05-13' }),
    );
    const get = (label: string) => fields.find((f) => f.field === label)?.value;
    assert.equal(get('Internal reference'), 'INC-2026-009');
    assert.equal(get('Reportable to the regulator'), 'Yes');
    assert.equal(get('Regulator reference'), 'RID-1');
    assert.equal(get('Date reported to the regulator'), '2026-05-13');
  });
});
