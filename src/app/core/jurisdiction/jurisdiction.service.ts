import { Injectable, computed, signal } from '@angular/core';

import {
  DEFAULT_JURISDICTION,
  type JurisdictionConfig,
  type JurisdictionId,
  allJurisdictions,
  isJurisdictionId,
  jurisdictionConfig,
} from '../domain/jurisdiction';

const STORAGE_KEY = 'trainovate-jurisdiction';

/**
 * Signal-backed, localStorage-persisted jurisdiction selection. Mirrors the
 * `ThemeService` storage idiom. The pure config/framing logic lives in
 * `core/domain/jurisdiction.ts` (unit-tested); this wrapper only adds reactive
 * state + persistence so the UI can drive defaults and formatting.
 */
@Injectable({ providedIn: 'root' })
export class JurisdictionService {
  readonly jurisdiction = signal<JurisdictionId>(this.read());

  /** Full config for the active jurisdiction (date format, units, framing…). */
  readonly config = computed<JurisdictionConfig>(() => jurisdictionConfig(this.jurisdiction()));

  /** Jurisdiction-flavoured framing default for the compliance register. */
  readonly complianceFraming = computed(() => this.config().complianceFraming);

  /** Date token for `DatePipe` driven by the active jurisdiction. */
  readonly dateFormat = computed(() => this.config().dateFormat);

  readonly options: readonly JurisdictionConfig[] = allJurisdictions();

  setJurisdiction(id: JurisdictionId): void {
    if (!isJurisdictionId(id)) return;
    this.jurisdiction.set(id);
    this.save();
  }

  private read(): JurisdictionId {
    if (typeof localStorage === 'undefined') return DEFAULT_JURISDICTION;
    const stored = localStorage.getItem(STORAGE_KEY);
    return isJurisdictionId(stored) ? stored : DEFAULT_JURISDICTION;
  }

  private save(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, this.jurisdiction());
    }
  }
}
