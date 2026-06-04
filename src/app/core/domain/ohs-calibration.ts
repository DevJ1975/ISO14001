import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Calibration register for monitoring & measuring equipment (ISO 45001 cl.
 * 9.1.1 — "calibrated or verified measuring equipment"). Auditors routinely
 * sample whether instruments used for environmental monitoring are in
 * calibration; an out-of-calibration instrument undermines the 9.1 data.
 */
const calibrationDateSchema = z.union([z.string().date(), z.string().datetime(), z.date()]);

export const calibrationRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  equipment: z.string().min(1).max(300),
  identifier: z.string().max(120).optional(),
  parameter: z.string().max(200).optional(),
  method: z.string().max(300).optional(),
  lastCalibratedAt: calibrationDateSchema.optional(),
  nextDueAt: calibrationDateSchema.optional(),
  frequencyMonths: z.number().int().min(0).max(120).optional(),
  outOfService: z.boolean().optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type CalibrationRecord = z.infer<typeof calibrationRecordSchema>;

export type CalibrationStatus = 'valid' | 'dueSoon' | 'overdue' | 'outOfService' | 'noDate';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calibration status from the next-due date: out-of-service overrides; otherwise
 * overdue (past), dueSoon (within `withinDays`, default 30), valid, or noDate.
 */
export function calibrationStatus(
  record: { nextDueAt?: string | Date; outOfService?: boolean },
  now: string | Date = new Date(),
  withinDays = 30,
): CalibrationStatus {
  if (record.outOfService) return 'outOfService';
  if (!record.nextDueAt) return 'noDate';
  const due = new Date(record.nextDueAt).getTime();
  if (Number.isNaN(due)) return 'noDate';
  const days = Math.floor((due - new Date(now).getTime()) / DAY_MS);
  if (days < 0) return 'overdue';
  return days <= withinDays ? 'dueSoon' : 'valid';
}
