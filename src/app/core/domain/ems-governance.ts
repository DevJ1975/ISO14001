import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * EMS governance registers that the original foundation left thin or absent.
 * These close ISO 14001:2015/2026 clause gaps surfaced in the lead-auditor
 * review: interested parties (4.2), environmental objectives & targets (6.2),
 * internal/external communication (7.4), and management review (9.3). Each
 * follows the same shape as the existing EMS registers (`ems-registers.ts`):
 * tenant- and audit-scoped, carrying an auditor `result` and evidence refs.
 */

/** Interested parties and their needs & expectations (ISO 14001 cl. 4.2). */
export const interestedPartySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  party: z.string().min(1).max(300),
  category: z.enum(['internal', 'external']).default('external'),
  needs: z.string().max(1000).optional(),
  howAddressed: z.string().max(1000).optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type InterestedParty = z.infer<typeof interestedPartySchema>;

export const objectiveProgressSchema = z.enum(['notStarted', 'onTrack', 'atRisk', 'achieved']);

/** Environmental objectives & targets with progress (ISO 14001 cl. 6.2). */
export const environmentalObjectiveSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  objective: z.string().min(1).max(300),
  target: z.string().max(500).optional(),
  owner: z.string().max(300).optional(),
  dueDate: timestampSchema.optional(),
  progress: objectiveProgressSchema.default('notStarted'),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type EnvironmentalObjective = z.infer<typeof environmentalObjectiveSchema>;

/** Internal & external communication (ISO 14001 cl. 7.4). */
export const communicationRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  topic: z.string().min(1).max(300),
  direction: z.enum(['internal', 'external', 'both']).default('internal'),
  audience: z.string().max(300).optional(),
  method: z.string().max(300).optional(),
  frequency: z.string().max(120).optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type CommunicationRecord = z.infer<typeof communicationRecordSchema>;

/** Management review inputs, decisions & outputs (ISO 14001 cl. 9.3). */
export const managementReviewSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  reviewDate: timestampSchema.optional(),
  attendees: z.string().max(1000).optional(),
  inputs: z.string().max(2000).optional(),
  decisions: z.string().max(2000).optional(),
  actions: z.string().max(2000).optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type ManagementReview = z.infer<typeof managementReviewSchema>;
