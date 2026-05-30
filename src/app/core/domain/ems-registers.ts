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
  controls: z.string().max(1000).optional(),
  relatedClauseId: z.string().optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type EnvironmentalAspect = z.infer<typeof environmentalAspectSchema>;

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
