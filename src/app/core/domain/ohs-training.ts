import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Training matrix entry (ISO 14001 cl. 7.2 — competence). Where the competence
 * register captures role requirements, this tracks the *evidence* dimension
 * competitor EHS platforms lead with: per-person completion with renewal/expiry,
 * so statutory refreshers (spill response, first-aid, forklift, ISO awareness)
 * that have lapsed surface as gaps. Expired mandatory training is a classic NC.
 */
const trainingDateSchema = z.union([z.string().date(), z.string().datetime(), z.date()]);

export const trainingRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  person: z.string().min(1).max(200),
  role: z.string().max(200).optional(),
  course: z.string().min(1).max(300),
  completedAt: trainingDateSchema.optional(),
  expiresAt: trainingDateSchema.optional(),
  frequencyMonths: z.number().int().min(0).max(120).optional(),
  mandatory: z.boolean().optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type TrainingRecord = z.infer<typeof trainingRecordSchema>;

export type TrainingStatus = 'current' | 'dueSoon' | 'expired' | 'notTrained';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Training status from completion/expiry: notTrained (never completed), expired
 * (past expiry), dueSoon (expiry within `withinDays`, default 30), else current.
 * Training with a completion date but no expiry is treated as current (one-off).
 */
export function trainingStatus(
  record: { completedAt?: string | Date; expiresAt?: string | Date },
  now: string | Date = new Date(),
  withinDays = 30,
): TrainingStatus {
  if (!record.completedAt) return 'notTrained';
  if (!record.expiresAt) return 'current';
  const expiry = new Date(record.expiresAt).getTime();
  if (Number.isNaN(expiry)) return 'current';
  const days = Math.floor((expiry - new Date(now).getTime()) / DAY_MS);
  if (days < 0) return 'expired';
  return days <= withinDays ? 'dueSoon' : 'current';
}
