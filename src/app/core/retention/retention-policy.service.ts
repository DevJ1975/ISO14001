import { Injectable, computed, effect, signal } from '@angular/core';

import type { RetentionCategoryId } from '../domain';

/**
 * Client-side persistence for the retention policy overrides (legal holds and
 * per-category period tweaks). Mirrors the localStorage idiom in
 * `theme.service.ts`: a signal hydrated from storage and written back on change.
 *
 * LIMITATION (first iteration): overrides live only in this browser's
 * localStorage — there is no backend route, so holds/periods do not sync across
 * devices or auditors. A future iteration would persist these server-side.
 */
export interface RetentionOverride {
  /** Overridden retention period in whole years; omitted means "use the default". */
  years?: number;
  /** When true, a legal hold suspends disposal for this category. */
  legalHold?: boolean;
}

export type RetentionOverrides = Partial<Record<RetentionCategoryId, RetentionOverride>>;

const STORAGE_KEY = 'trainovate-retention-overrides';

@Injectable({ providedIn: 'root' })
export class RetentionPolicyService {
  private readonly _overrides = signal<RetentionOverrides>(this.read());

  /** Read-only view of the current overrides for the retention computation. */
  readonly overrides = computed(() => this._overrides());

  constructor() {
    effect(() => this.save(this._overrides()));
  }

  /** Toggle (or set) the legal hold for one category. */
  setLegalHold(id: RetentionCategoryId, legalHold: boolean): void {
    this._overrides.update((current) => {
      const next = { ...current, [id]: { ...current[id], legalHold } };
      return prune(next);
    });
  }

  toggleLegalHold(id: RetentionCategoryId): void {
    this.setLegalHold(id, !this._overrides()[id]?.legalHold);
  }

  /** Override the retention period (years) for one category; pass undefined to clear. */
  setYears(id: RetentionCategoryId, years: number | undefined): void {
    this._overrides.update((current) => {
      const next = { ...current, [id]: { ...current[id], years } };
      return prune(next);
    });
  }

  /** Clear all overrides (legal holds and period tweaks). */
  reset(): void {
    this._overrides.set({});
  }

  private read(): RetentionOverrides {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as RetentionOverrides) : {};
    } catch {
      return {};
    }
  }

  private save(overrides: RetentionOverrides): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Persistence is best-effort; ignore quota/availability errors.
    }
  }
}

/** Drop empty per-category entries so cleared overrides do not linger. */
function prune(overrides: RetentionOverrides): RetentionOverrides {
  const result: RetentionOverrides = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) continue;
    const entry: RetentionOverride = {};
    if (typeof value.years === 'number' && Number.isFinite(value.years)) entry.years = value.years;
    if (value.legalHold === true) entry.legalHold = true;
    if (Object.keys(entry).length > 0) result[key as RetentionCategoryId] = entry;
  }
  return result;
}
