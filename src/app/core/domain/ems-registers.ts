import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

export const significanceSchema = z.enum(['low', 'medium', 'high']);
export const lifecycleStageSchema = z.enum(['rawMaterials', 'production', 'distribution', 'use', 'endOfLife']);

/** Significant environmental aspects register (ISO 14001 cl. 6.1.2 / 8.1). */
export const environmentalAspectSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  aspect: z.string().min(1).max(300),
  activity: z.string().min(1).max(300),
  impact: z.string().min(1).max(300),
  lifecycleStage: lifecycleStageSchema.optional(),
  significance: significanceSchema,
  // Significance-evaluation methodology (cl. 6.1.2 requires criteria, not a bare
  // label). Optional & flat so existing data still validates and the JSONB store
  // round-trips them: severity × likelihood scored 1–5, with legal/stakeholder
  // escalators and the auditor's rationale.
  severityScore: z.number().int().min(1).max(5).optional(),
  likelihoodScore: z.number().int().min(1).max(5).optional(),
  legalConcern: z.boolean().optional(),
  stakeholderConcern: z.boolean().optional(),
  significanceRationale: z.string().max(1000).optional(),
  controls: z.string().max(1000).optional(),
  relatedClauseId: z.string().optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type EnvironmentalAspect = z.infer<typeof environmentalAspectSchema>;

export interface AspectSignificanceInput {
  severity?: number;
  likelihood?: number;
  legalConcern?: boolean;
  stakeholderConcern?: boolean;
}

export interface AspectSignificanceResult {
  /** severity × likelihood (1–25); 0 until both factors are scored. */
  score: number;
  band: z.infer<typeof significanceSchema>;
}

function clampScore(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value)));
}

/**
 * Derive a defensible significance band from scored criteria. Core is severity ×
 * likelihood (each 1–5 → 1–25): ≥15 high, ≥6 medium, else low. A legal concern
 * raises the band one level (it can never be low); a stakeholder concern lifts a
 * low band to medium. The auditor can still override the recorded `significance`.
 */
export function evaluateAspectSignificance(input: AspectSignificanceInput): AspectSignificanceResult {
  const score = clampScore(input.severity) * clampScore(input.likelihood);
  let band: z.infer<typeof significanceSchema> = score >= 15 ? 'high' : score >= 6 ? 'medium' : 'low';
  if (input.legalConcern && band !== 'high') band = band === 'low' ? 'medium' : 'high';
  if (input.stakeholderConcern && band === 'low') band = 'medium';
  return { score, band };
}

export const complianceStatusSchema = z.enum(['compliant', 'nonCompliant', 'toVerify']);

/** Compliance obligations register + evaluation of compliance (ISO 14001 cl. 6.1.3 / 9.1.2). */
export const complianceObligationSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  obligation: z.string().min(1).max(300),
  source: z.enum(['legal', 'other']),
  requirement: z.string().min(1).max(1000),
  complianceStatus: complianceStatusSchema.default('toVerify'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  lastEvaluatedAt: timestampSchema.optional(),
  result: checklistItemResultSchema.default('notStarted'),
  updatedAt: timestampSchema,
});
export type ComplianceObligation = z.infer<typeof complianceObligationSchema>;

/** Emergency preparedness & response (ISO 14001 cl. 8.2). */
export const emergencyPreparednessSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  scenario: z.string().min(1).max(300),
  procedureRef: z.string().max(300).optional(),
  lastDrillAt: timestampSchema.optional(),
  result: checklistItemResultSchema.default('notStarted'),
  notes: z.string().max(1000).optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type EmergencyPreparedness = z.infer<typeof emergencyPreparednessSchema>;
