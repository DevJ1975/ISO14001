import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

export const riskBandSchema = z.enum(['low', 'medium', 'high']);
export type RiskBand = z.infer<typeof riskBandSchema>;

/** Hierarchy of controls (ISO 45001 cl. 8.1.2), most to least effective. */
export const hierarchyOfControlsSchema = z.enum([
  'elimination',
  'substitution',
  'engineering',
  'administrative',
  'ppe',
]);
export type HierarchyOfControls = z.infer<typeof hierarchyOfControlsSchema>;

/** Hazard identification & OH&S risk register (ISO 45001 cl. 6.1.2 / 8.1.2). */
export const hazardSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  hazard: z.string().min(1).max(300),
  activity: z.string().min(1).max(300),
  harm: z.string().min(1).max(300),
  riskBand: riskBandSchema,
  // Risk-rating methodology (cl. 6.1.2 expects criteria, not a bare label).
  // Optional & flat so existing data still validates and the JSONB store
  // round-trips them: severity × likelihood scored 1–5, with a legal-duty and a
  // worker-raised escalator and the auditor's rationale. Residual risk records
  // the rating once the recorded controls are applied.
  severityScore: z.number().int().min(1).max(5).optional(),
  likelihoodScore: z.number().int().min(1).max(5).optional(),
  legalConcern: z.boolean().optional(),
  workerConcern: z.boolean().optional(),
  existingControls: z.string().max(1000).optional(),
  controlType: hierarchyOfControlsSchema.optional(),
  residualRiskBand: riskBandSchema.optional(),
  riskRatingRationale: z.string().max(1000).optional(),
  relatedClauseId: z.string().optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type Hazard = z.infer<typeof hazardSchema>;

export interface RiskRatingInput {
  severity?: number;
  likelihood?: number;
  legalConcern?: boolean;
  workerConcern?: boolean;
}

export interface RiskRatingResult {
  /** severity × likelihood (1–25); 0 until both factors are scored. */
  score: number;
  band: RiskBand;
}

function clampScore(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value)));
}

/**
 * Derive a defensible OH&S risk band from scored criteria. Core is severity ×
 * likelihood (each 1–5 → 1–25): ≥15 high, ≥6 medium, else low. A legal duty
 * raises the band one level (it can never be low); a worker-raised concern lifts
 * a low band to medium. The auditor can still override the recorded `riskBand`.
 */
export function evaluateRiskRating(input: RiskRatingInput): RiskRatingResult {
  const score = clampScore(input.severity) * clampScore(input.likelihood);
  let band: RiskBand = score >= 15 ? 'high' : score >= 6 ? 'medium' : 'low';
  if (input.legalConcern && band !== 'high') band = band === 'low' ? 'medium' : 'high';
  if (input.workerConcern && band === 'low') band = 'medium';
  return { score, band };
}

export const complianceStatusSchema = z.enum(['compliant', 'nonCompliant', 'toVerify']);

/** OH&S legal & other requirements register + evaluation of compliance (ISO 45001 cl. 6.1.3 / 9.1.2). */
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

/** Emergency preparedness & response (ISO 45001 cl. 8.2). */
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
