import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Environmental performance monitoring & measurement (ISO 14001 cl. 9.1.1).
 * The other registers capture qualitative conformity; this one captures the
 * quantitative backbone — measured indicators (energy, water, waste, emissions)
 * with units, periods, target-vs-actual and a trend, so an auditor can evaluate
 * "analysis and evaluation" of environmental performance, not just status.
 */
export const performanceCategorySchema = z.enum([
  'energy',
  'water',
  'waste',
  'emissions',
  'materials',
  'effluent',
  'other',
]);
export type PerformanceCategory = z.infer<typeof performanceCategorySchema>;

export const performanceTrendSchema = z.enum(['improving', 'stable', 'worsening', 'notEvaluated']);
export type PerformanceTrend = z.infer<typeof performanceTrendSchema>;

export const performanceMetricSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  indicator: z.string().min(1).max(300),
  category: performanceCategorySchema.default('energy'),
  unit: z.string().max(40).default(''),
  period: z.string().max(60).default(''),
  baselineValue: z.number().finite().optional(),
  targetValue: z.number().finite().optional(),
  actualValue: z.number().finite().optional(),
  trend: performanceTrendSchema.default('notEvaluated'),
  monitoringMethod: z.string().max(500).optional(),
  dataSource: z.string().max(300).optional(),
  evaluationNotes: z.string().max(2000).optional(),
  relatedObjectiveId: z.string().optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;

export interface MetricVariance {
  /** actual − target, in the indicator's unit. */
  absolute: number;
  /** Variance as a percentage of the (absolute) target, or null when target is 0. */
  percent: number | null;
}

/** Variance of actual against target. Null when either value is missing. */
export function metricVariance(metric: { actualValue?: number; targetValue?: number }): MetricVariance | null {
  if (metric.actualValue == null || metric.targetValue == null) return null;
  const absolute = metric.actualValue - metric.targetValue;
  const percent = metric.targetValue === 0 ? null : (absolute / Math.abs(metric.targetValue)) * 100;
  return { absolute, percent: percent == null ? null : Math.round(percent * 10) / 10 };
}

/**
 * Derive a trend from a chronological series of readings. For most environmental
 * indicators lower is better (less energy/water/waste/emissions); pass
 * `lowerIsBetter = false` for indicators where higher is better (e.g. recycling
 * rate). A change within `tolerance` (default 2%) of the first reading is 'stable'.
 */
export function deriveTrend(values: number[], lowerIsBetter = true, tolerance = 0.02): PerformanceTrend {
  if (values.length < 2) return 'notEvaluated';
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const scale = Math.abs(first) || 1;
  if (Math.abs(delta) / scale <= tolerance) return 'stable';
  const wentDown = delta < 0;
  const improved = lowerIsBetter ? wentDown : !wentDown;
  return improved ? 'improving' : 'worsening';
}
