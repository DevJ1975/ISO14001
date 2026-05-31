import { z } from 'zod';

import { timestampSchema } from './models.js';

/**
 * Complaints & appeals register for a certification body (ISO/IEC 17021-1
 * cl. 9.7 complaints, 9.8 appeals): receive, review, decide and close, keeping
 * the record an accreditation assessor will ask to see. Tenant-scoped (lives on
 * the tenant's audit programme alongside certificates).
 */
export const complaintKindSchema = z.enum(['complaint', 'appeal']);
export type ComplaintKind = z.infer<typeof complaintKindSchema>;

export const complaintStatusSchema = z.enum([
  'received',
  'underReview',
  'resolved',
  'closed',
  'upheld',
  'rejected',
]);
export type ComplaintStatus = z.infer<typeof complaintStatusSchema>;

export const complaintAppealSchema = z.object({
  id: z.string().min(1),
  kind: complaintKindSchema.default('complaint'),
  subject: z.string().min(1).max(300),
  source: z.string().max(300).optional(),
  description: z.string().max(2000).default(''),
  receivedAt: z.union([z.string().date(), z.string().datetime(), z.date()]).optional(),
  dueDate: z.union([z.string().date(), z.string().datetime(), z.date()]).optional(),
  status: complaintStatusSchema.default('received'),
  handledBy: z.string().max(200).optional(),
  resolution: z.string().max(2000).optional(),
  updatedAt: timestampSchema,
});
export type ComplaintAppeal = z.infer<typeof complaintAppealSchema>;

const OPEN_STATUSES: ComplaintStatus[] = ['received', 'underReview'];

/** True while the complaint/appeal still needs action (not resolved/closed/decided). */
export function isComplaintOpen(item: { status: ComplaintStatus }): boolean {
  return OPEN_STATUSES.includes(item.status);
}

/** True when an open item is past its target resolution date. */
export function isComplaintOverdue(
  item: { status: ComplaintStatus; dueDate?: string | Date },
  now: string | Date = new Date(),
): boolean {
  if (!item.dueDate || !isComplaintOpen(item)) return false;
  const due = new Date(item.dueDate).getTime();
  if (Number.isNaN(due)) return false;
  return due < new Date(now).getTime();
}
