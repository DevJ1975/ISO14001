import { Injectable } from '@angular/core';

import { CsvColumn, csvFilename, toCsv } from './csv';

/**
 * Thin browser wrapper around the pure `toCsv` serialiser: turns a row set into a
 * downloaded `.csv` file. Client-side only — no backend round-trip — so it works
 * offline and never sends audit data to a third party. The serialisation logic
 * is unit-tested via `csv.ts`; this service only owns the DOM download.
 */
@Injectable({ providedIn: 'root' })
export class CsvExportService {
  /** Serialise `rows` with the given columns and trigger a browser download. */
  download<T>(stem: string, rows: readonly T[], columns: readonly CsvColumn<T>[]): void {
    const csv = toCsv(rows, columns);
    const filename = csvFilename(stem);
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Revoke on the next tick so the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
