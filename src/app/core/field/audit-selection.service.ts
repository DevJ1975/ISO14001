import { Injectable, inject, signal } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';

const KEY = 'trainovate-selected-audit';

/**
 * Holds the currently selected audit id. Kept dependency-free so both the API
 * client and the audit-context service can inject it without a DI cycle.
 */
@Injectable({ providedIn: 'root' })
export class AuditSelectionService {
  private readonly config = inject(APP_CONFIG);
  readonly selectedAuditId = signal<string>(this.read());

  select(auditId: string): void {
    this.selectedAuditId.set(auditId);
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, auditId);
  }

  private read(): string {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return stored || this.config.auditId;
  }
}
