import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toCsv } from '../src/app/core/export/csv';
import { hazardColumns, supplierColumns } from '../src/app/features/registers/registers-export';

describe('register CSV column specs', () => {
  it('exports the hazard & risk register with the hierarchy-of-controls column', () => {
    const rows = [
      {
        id: 'h1', aspect: 'Working at height', activity: 'Roof-mounted plant access', impact: 'Fall — serious injury',
        significance: 'high' as const, controlType: 'engineering' as const, controls: 'Fixed guardrail + harness',
        result: 'conforming' as const, updatedAt: '', sync: 'synced' as const,
      },
    ];
    const csv = toCsv(rows, hazardColumns, { bom: false, eol: '\n' });
    const [header, firstRow] = csv.trim().split('\n');
    assert.ok(header.includes('Hazard'));
    assert.ok(header.includes('Control type'));
    assert.ok(firstRow.includes('Working at height'), `expected hazard in row: ${firstRow}`);
    assert.ok(firstRow.includes('engineering'));
    assert.ok(firstRow.includes('high'));
  });

  it('renders boolean supplier flags as yes/no and escapes notes with commas', () => {
    const rows = [
      { id: 's1', name: 'SafeScaffold Ltd', category: 'labourProvider' as const, environmentallyRelevant: true, controlsCommunicated: false, rating: 'approved' as const, notes: 'Method statement incomplete, chase docs', result: 'needsFollowUp' as const, updatedAt: '', sync: 'synced' as const },
    ];
    const csv = toCsv(rows, supplierColumns, { bom: false, eol: '\n' });
    const firstRow = csv.trim().split('\n')[1]!;
    assert.ok(firstRow.includes('yes')); // safety-relevant
    assert.ok(firstRow.includes('no')); // controlsCommunicated
    assert.ok(firstRow.includes('"Method statement incomplete, chase docs"')); // comma-bearing note is quoted
  });
});
