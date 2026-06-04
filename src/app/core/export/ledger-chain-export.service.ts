import { Injectable } from '@angular/core';

import { LedgerChainExport } from '../domain';

/** Build a slugged, date-stamped filename stem (e.g. "Northstar — Denver" → "northstar-denver-audit-trail-2026-06-04.json"). */
export function ledgerChainFilename(auditee: string, date: Date = new Date()): string {
  const slug =
    auditee
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'audit';
  const stamp = date.toISOString().slice(0, 10);
  return `${slug}-audit-trail-${stamp}.json`;
}

/**
 * Serialises a tamper-evident audit-trail (`LedgerChainExport`) to a downloaded
 * `.json` file. Client-side only — no backend round-trip — so the chained log
 * (including its head hash) can be exported offline for an external party to
 * re-verify. The chain assembly (`buildLedgerChain` / `buildLedgerChainExport`)
 * is unit-tested separately; this service only owns the DOM download. Mirrors
 * `WorkingPapersExportService`.
 */
@Injectable({ providedIn: 'root' })
export class LedgerChainExportService {
  /** Serialise `doc` to pretty-printed JSON and trigger a browser download. */
  download(doc: LedgerChainExport, auditee: string, date: Date = new Date()): void {
    const json = JSON.stringify(doc, null, 2);
    const filename = ledgerChainFilename(auditee, date);
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
}
