import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Greenhouse-gas (carbon) inventory entry, organised by the GHG Protocol scopes
 * (ISO 14001 cl. 9.1 environmental performance / cl. 6.1.2 aspects — climate).
 * ESG/carbon accounting is a capability comparable EHS/ESG platforms lead with.
 *
 *   tCO2e = activityData × emissionFactor (kgCO2e per unit) ÷ 1000
 *
 * Scope 1 = direct (combustion, fleet, fugitive); Scope 2 = purchased energy;
 * Scope 3 = value chain (travel, waste, purchased goods, logistics).
 */
export const ghgScopes = [1, 2, 3] as const;
export type GhgScope = (typeof ghgScopes)[number];

export const carbonEntrySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  source: z.string().min(1).max(300),
  scope: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  category: z.string().max(200).optional(),
  period: z.string().max(60).optional(),
  activityData: z.number().min(0).optional(),
  activityUnit: z.string().max(40).optional(),
  emissionFactor: z.number().min(0).optional(),
  /** Optional manual override of computed tCO2e (e.g. supplier-provided figure). */
  tco2eOverride: z.number().min(0).optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type CarbonEntry = z.infer<typeof carbonEntrySchema>;

/** Computed tonnes CO2e for an entry: manual override if set, else activity × factor ÷ 1000. */
export function emissionTco2e(entry: {
  activityData?: number;
  emissionFactor?: number;
  tco2eOverride?: number;
}): number {
  if (typeof entry.tco2eOverride === 'number' && entry.tco2eOverride >= 0) return entry.tco2eOverride;
  if (typeof entry.activityData === 'number' && typeof entry.emissionFactor === 'number') {
    return (entry.activityData * entry.emissionFactor) / 1000;
  }
  return 0;
}

export interface CarbonRollup {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  /** Share of total per scope (0–100), for the dashboard breakdown bar. */
  pct: { scope1: number; scope2: number; scope3: number };
  entryCount: number;
}

/** Aggregate a carbon inventory into per-scope totals (tCO2e) and shares. Pure & testable. */
export function carbonRollup(
  entries: { scope?: GhgScope; activityData?: number; emissionFactor?: number; tco2eOverride?: number }[],
): CarbonRollup {
  let scope1 = 0;
  let scope2 = 0;
  let scope3 = 0;
  for (const entry of entries) {
    const tco2e = emissionTco2e(entry);
    if (entry.scope === 2) scope2 += tco2e;
    else if (entry.scope === 3) scope3 += tco2e;
    else scope1 += tco2e;
  }
  const total = scope1 + scope2 + scope3;
  const share = (value: number): number => (total > 0 ? Math.round((value / total) * 100) : 0);
  return {
    scope1,
    scope2,
    scope3,
    total,
    pct: { scope1: share(scope1), scope2: share(scope2), scope3: share(scope3) },
    entryCount: entries.length,
  };
}

/** Round a tCO2e figure for display (1 dp under 100 t, whole numbers above). */
export function formatTco2e(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value >= 100 ? Math.round(value).toLocaleString() : (Math.round(value * 10) / 10).toString();
}
