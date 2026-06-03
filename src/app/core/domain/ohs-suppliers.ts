import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Supplier / contractor evaluation (ISO 14001 cl. 8.1 — control of outsourced
 * processes and environmentally relevant procurement). Where a supplier or
 * on-site contractor can affect the EMS (waste carriers, recyclers, chemical
 * suppliers, maintenance contractors), the organisation must evaluate and
 * control them; a relevant supplier with no current evaluation, or a poor
 * rating left unactioned, is a common finding.
 */
const supplierDateSchema = z.union([z.string().date(), z.string().datetime(), z.date()]);

export const supplierRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  name: z.string().min(1).max(300),
  serviceType: z.string().max(200).optional(),
  category: z.enum(['supplier', 'contractor', 'wasteCarrier', 'recycler', 'other']).default('supplier'),
  /** Whether this party can materially affect the EMS (drives the "needs evaluation" alert). */
  environmentallyRelevant: z.boolean().optional(),
  controlsCommunicated: z.boolean().optional(),
  rating: z.enum(['notRated', 'approved', 'conditional', 'rejected']).default('notRated'),
  lastEvaluatedAt: supplierDateSchema.optional(),
  nextEvaluationAt: supplierDateSchema.optional(),
  evaluationFrequencyMonths: z.number().int().min(0).max(120).optional(),
  notes: z.string().max(2000).optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type SupplierRecord = z.infer<typeof supplierRecordSchema>;

export type SupplierEvaluationStatus = 'current' | 'dueSoon' | 'overdue' | 'notEvaluated' | 'notRelevant';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Supplier evaluation status from relevance + next-evaluation date:
 * notRelevant (not environmentally relevant — excluded from chase),
 * notEvaluated (relevant but never evaluated), overdue (re-evaluation past),
 * dueSoon (within `withinDays`, default 30), else current.
 */
export function supplierEvaluationStatus(
  record: { environmentallyRelevant?: boolean; lastEvaluatedAt?: string | Date; nextEvaluationAt?: string | Date },
  now: string | Date = new Date(),
  withinDays = 30,
): SupplierEvaluationStatus {
  if (!record.environmentallyRelevant) return 'notRelevant';
  if (!record.lastEvaluatedAt) return 'notEvaluated';
  if (!record.nextEvaluationAt) return 'current';
  const due = new Date(record.nextEvaluationAt).getTime();
  if (Number.isNaN(due)) return 'current';
  const days = Math.floor((due - new Date(now).getTime()) / DAY_MS);
  if (days < 0) return 'overdue';
  return days <= withinDays ? 'dueSoon' : 'current';
}
