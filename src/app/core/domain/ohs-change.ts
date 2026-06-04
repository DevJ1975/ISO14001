import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Management of Change (ISO 45001 cl. 8.1 — "the organization shall control
 * planned changes and review the consequences of unintended changes"). New
 * equipment, process or material changes, organisational or regulatory changes
 * can introduce new environmental aspects. The classic finding is a change made
 * (or approved) without its environmental aspects/impacts being assessed first.
 */
const mocDateSchema = z.union([z.string().date(), z.string().datetime(), z.date()]);

export const mocStatuses = ['proposed', 'assessing', 'approved', 'implemented', 'closed', 'rejected'] as const;
export type MocStatus = (typeof mocStatuses)[number];

export const managementOfChangeRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  changeType: z.enum(['process', 'equipment', 'material', 'organisational', 'regulatory', 'other']).default('process'),
  status: z.enum(mocStatuses).default('proposed'),
  /** Whether the environmental aspects/impacts of the change have been assessed (the key control). */
  aspectsReviewed: z.boolean().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  owner: z.string().max(200).optional(),
  controls: z.string().max(2000).optional(),
  targetDate: mocDateSchema.optional(),
  implementedAt: mocDateSchema.optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type ManagementOfChangeRecord = z.infer<typeof managementOfChangeRecordSchema>;

export type MocAttention = 'onTrack' | 'overdue' | 'aspectsOutstanding' | 'settled';

/**
 * Whether a change of management record needs attention:
 * settled (closed/rejected — no action), aspectsOutstanding (approved or
 * implemented without an environmental aspects review — the key gap), overdue
 * (still open past its target date), otherwise onTrack.
 */
export function mocAttention(
  record: { status?: MocStatus; aspectsReviewed?: boolean; targetDate?: string | Date },
  now: string | Date = new Date(),
): MocAttention {
  const status = record.status ?? 'proposed';
  if (status === 'closed' || status === 'rejected') return 'settled';
  if ((status === 'approved' || status === 'implemented') && !record.aspectsReviewed) return 'aspectsOutstanding';
  if (record.targetDate) {
    const target = new Date(record.targetDate).getTime();
    if (!Number.isNaN(target) && target < new Date(now).getTime()) return 'overdue';
  }
  return 'onTrack';
}
