import { Injectable, inject } from '@angular/core';

import { WorkingPapers } from '../domain';
import { CsvExportService } from './csv-export.service';

/** Build a slugged, date-stamped filename stem (e.g. "Northstar — Denver" → "northstar-denver-working-papers"). */
export function workingPapersFilename(auditee: string, date: Date = new Date()): string {
  const slug =
    auditee
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'audit';
  const stamp = date.toISOString().slice(0, 10);
  return `${slug}-working-papers-${stamp}.json`;
}

/**
 * Serialises a `WorkingPapers` pack to a downloaded `.json` file. Client-side
 * only — no backend round-trip — so the working-papers archive can be produced
 * offline and never leaves the device except by the auditor's explicit download.
 * The pack assembly (`buildWorkingPapers`) is unit-tested separately; this
 * service only owns the DOM download.
 */
@Injectable({ providedIn: 'root' })
export class WorkingPapersExportService {
  private readonly csv = inject(CsvExportService);

  /** Serialise `pack` to pretty-printed JSON and trigger a browser download. */
  download(pack: WorkingPapers, auditee: string, date: Date = new Date()): void {
    const json = JSON.stringify(pack, null, 2);
    const filename = workingPapersFilename(auditee, date);
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return;
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
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

  /** Expose the shared CSV download helper for the optional flat findings summary. */
  get csvExport(): CsvExportService {
    return this.csv;
  }
}
