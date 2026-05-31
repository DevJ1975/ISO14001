import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { csvFilename, escapeCsvField, toCsv } from '../src/app/core/export/csv';

describe('CSV serialisation (RFC 4180)', () => {
  it('leaves plain fields unquoted', () => {
    assert.equal(escapeCsvField('hello'), 'hello');
    assert.equal(escapeCsvField(42), '42');
    assert.equal(escapeCsvField(true), 'true');
  });

  it('renders null and undefined as empty', () => {
    assert.equal(escapeCsvField(null), '');
    assert.equal(escapeCsvField(undefined), '');
  });

  it('quotes fields containing a comma, quote, or newline and doubles quotes', () => {
    assert.equal(escapeCsvField('a,b'), '"a,b"');
    assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
    assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
  });

  it('serialises rows with a header and CRLF terminators, with a BOM by default', () => {
    const rows = [{ name: 'Gas, boiler', qty: 4200 }];
    const csv = toCsv(rows, [
      { header: 'Name', value: (r) => r.name },
      { header: 'Qty', value: (r) => r.qty },
    ]);
    assert.equal(csv, '﻿Name,Qty\r\n"Gas, boiler",4200\r\n');
  });

  it('can omit the BOM and use a custom line terminator', () => {
    const csv = toCsv([{ a: 1 }], [{ header: 'A', value: (r) => r.a }], { bom: false, eol: '\n' });
    assert.equal(csv, 'A\n1\n');
  });

  it('emits only the header row for an empty data set', () => {
    const csv = toCsv([], [{ header: 'A', value: () => '' }], { bom: false });
    assert.equal(csv, 'A\r\n');
  });

  it('builds a slugged, date-stamped filename', () => {
    assert.equal(csvFilename('Carbon inventory', new Date('2026-05-31T12:00:00Z')), 'carbon-inventory-2026-05-31.csv');
    assert.equal(csvFilename('  Supplier / Contractor!! ', new Date('2026-01-02T00:00:00Z')), 'supplier-contractor-2026-01-02.csv');
    assert.equal(csvFilename('', new Date('2026-01-02T00:00:00Z')), 'export-2026-01-02.csv');
  });
});
