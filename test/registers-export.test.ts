import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toCsv } from '../src/app/core/export/csv';
import { carbonColumns, supplierColumns } from '../src/app/features/registers/registers-export';

describe('register CSV column specs', () => {
  it('exports the computed tCO2e column in the carbon spec', () => {
    const rows = [
      { id: 'c1', source: 'Natural gas', scope: 1 as const, activityData: 4200, activityUnit: 'MWh', emissionFactor: 183, result: 'conforming' as const, updatedAt: '', sync: 'synced' as const },
    ];
    const csv = toCsv(rows, carbonColumns, { bom: false, eol: '\n' });
    const [header, firstRow] = csv.trim().split('\n');
    assert.ok(header.includes('tCO2e'));
    // 4200 × 183 ÷ 1000 = 768.6 → formatted to 769 (>= 100 t → whole number)
    assert.ok(firstRow.includes('769'), `expected computed tCO2e in row: ${firstRow}`);
    assert.ok(firstRow.startsWith('Natural gas,1,'));
  });

  it('renders boolean supplier flags as yes/no and escapes notes with commas', () => {
    const rows = [
      { id: 's1', name: 'GreenWaste', category: 'wasteCarrier' as const, environmentallyRelevant: true, controlsCommunicated: false, rating: 'approved' as const, notes: 'SDS pack incomplete, chase docs', result: 'needsFollowUp' as const, updatedAt: '', sync: 'synced' as const },
    ];
    const csv = toCsv(rows, supplierColumns, { bom: false, eol: '\n' });
    const firstRow = csv.trim().split('\n')[1]!;
    assert.ok(firstRow.includes('yes')); // environmentallyRelevant
    assert.ok(firstRow.includes('no')); // controlsCommunicated
    assert.ok(firstRow.includes('"SDS pack incomplete, chase docs"')); // comma-bearing note is quoted
  });
});
