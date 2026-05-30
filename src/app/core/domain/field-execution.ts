import { z } from 'zod';

import {
  clauseRefSchema,
  evidenceSchema,
  findingSchema,
  findingTypeSchema,
  timestampSchema,
} from './models.js';
import { changeOperationSchema } from './sync.js';

export const fieldCaptureSourceSchema = z.enum(['online', 'offline']);

export const fieldExecutionSessionSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  assignedMembers: z.array(z.string().min(1)).min(1),
  sectionOwners: z.record(z.string().min(1), z.string().min(1)).default({}),
});

export type FieldExecutionSession = z.infer<typeof fieldExecutionSessionSchema>;

export const noteEvidenceCaptureCommandSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  checklistItemId: z.string().min(1),
  clauseRef: clauseRefSchema,
  note: z.string().min(3).max(2000),
  capturedBy: z.string().min(1),
  capturedAt: timestampSchema,
  captureSource: fieldCaptureSourceSchema,
  offlineLocalId: z.string().min(1).optional(),
  geo: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyMeters: z.number().nonnegative().optional(),
    })
    .optional(),
});

export type NoteEvidenceCaptureCommand = z.infer<typeof noteEvidenceCaptureCommandSchema>;

export const fieldFindingDraftCommandSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  checklistItemId: z.string().min(1),
  clauseRef: clauseRefSchema,
  type: findingTypeSchema,
  severity: z.enum(['none', 'minor', 'major', 'opportunity']),
  description: z.string().min(10).max(2000),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  createdBy: z.string().min(1),
  createdAt: timestampSchema,
});

export type FieldFindingDraftCommand = z.infer<typeof fieldFindingDraftCommandSchema>;

export const syncQueueItemSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  collectionPath: z.string().min(1),
  documentId: z.string().min(1),
  operation: changeOperationSchema,
  queuedBy: z.string().min(1),
  queuedAt: timestampSchema,
  captureSource: fieldCaptureSourceSchema,
  status: z.enum(['pending', 'syncing', 'synced', 'failed', 'conflict']),
  retryCount: z.number().int().nonnegative().default(0),
});

export type SyncQueueItem = z.infer<typeof syncQueueItemSchema>;

export const offlineConflictSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  documentPath: z.string().min(1),
  fieldPaths: z.array(z.string().min(1)).min(1),
  localChangedBy: z.string().min(1),
  remoteChangedBy: z.string().min(1),
  detectedAt: timestampSchema,
  resolution: z.enum(['lastWriteWins', 'manualReviewRequired']),
});

export type OfflineConflict = z.infer<typeof offlineConflictSchema>;

export function createNoteEvidenceFromCapture(
  command: NoteEvidenceCaptureCommand,
  evidenceId: string,
): z.infer<typeof evidenceSchema> {
  return evidenceSchema.parse({
    id: evidenceId,
    tenantId: command.tenantId,
    auditId: command.auditId,
    type: 'note',
    note: command.note,
    timestamp: command.capturedAt,
    geo: command.geo,
    createdBy: command.capturedBy,
    links: [command.checklistItemId, command.clauseRef.clauseId],
  });
}

export function createFindingDraftFromFieldObservation(
  command: FieldFindingDraftCommand,
  findingId: string,
): z.infer<typeof findingSchema> {
  return findingSchema.parse({
    id: findingId,
    tenantId: command.tenantId,
    auditId: command.auditId,
    type: command.type,
    clauseRef: command.clauseRef,
    severity: command.severity,
    description: command.description,
    evidenceRefs: command.evidenceRefs,
    status: 'draft',
    createdBy: command.createdBy,
    createdAt: command.createdAt,
    updatedAt: command.createdAt,
  });
}

export function isAssignedAuditor(session: FieldExecutionSession, uid: string): boolean {
  return session.assignedMembers.includes(uid);
}

export function ownsChecklistSection(session: FieldExecutionSession, uid: string, clauseId: string): boolean {
  return session.sectionOwners[clauseId] === uid;
}

export function canCaptureForClause(session: FieldExecutionSession, uid: string, clauseId: string): boolean {
  return isAssignedAuditor(session, uid) && (!session.sectionOwners[clauseId] || ownsChecklistSection(session, uid, clauseId));
}
