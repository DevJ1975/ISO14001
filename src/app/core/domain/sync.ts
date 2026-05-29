import { z } from 'zod';

export const changeOperationSchema = z.enum(['create', 'update', 'delete', 'confirmAiDraft', 'signReport']);

export const changeLogEntrySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  collectionPath: z.string().min(1),
  documentId: z.string().min(1),
  operation: changeOperationSchema,
  changedBy: z.string().min(1),
  changedAt: z.union([z.date(), z.string().datetime()]),
  previousHash: z.string().optional(),
  nextHash: z.string().optional(),
});

export type ChangeLogEntry = z.infer<typeof changeLogEntrySchema>;

export const offlineMergePolicy = {
  documentConflictPolicy: 'last-write-wins-with-change-log',
  collisionReduction: 'lead-auditor-assigned-section-ownership',
  attributionRequiredFields: ['createdBy', 'changedBy', 'tenantId'],
} as const;
