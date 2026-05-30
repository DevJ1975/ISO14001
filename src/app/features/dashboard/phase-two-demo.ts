import {
  createFindingDraftFromFieldObservation,
  createNoteEvidenceFromCapture,
  FieldExecutionSession,
  OfflineConflict,
  SyncQueueItem,
} from '../../core/domain';
import { auditChecklistItemDocumentKey } from '../../core/backend/mongo-document-keys';
import { demoAuditSetup, demoChecklistTemplate, demoMembers, demoTenantId } from './phase-one-demo';

export const demoAuditId = 'audit-transition-1';

export const demoFieldSession: FieldExecutionSession = {
  tenantId: demoTenantId,
  auditId: demoAuditId,
  assignedMembers: demoAuditSetup.assignedMembers,
  sectionOwners: demoAuditSetup.sectionOwners,
};

export const demoChecklistExecutionItems = demoChecklistTemplate.items.map((item) => ({
  id: `audit-${item.id}`,
  tenantId: item.tenantId,
  auditId: demoAuditId,
  templateItemId: item.id,
  clauseRef: item.clauseRef,
  question: item.question,
  guidance: item.guidance,
  evidencePrompts: item.evidencePrompts,
  sortOrder: item.sortOrder,
  createdBy: item.createdBy,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  ownerUid: demoAuditSetup.sectionOwners[item.clauseRef.clauseId],
  result: item.clauseRef.clauseId === '4' ? 'conforming' : item.clauseRef.clauseId === '6' ? 'needsFollowUp' : 'notStarted',
  evidenceRefs: item.clauseRef.clauseId === '6' ? ['evidence-note-1'] : [],
  findingRefs: item.clauseRef.clauseId === '6' ? ['finding-draft-1'] : [],
}));

export const demoEvidence = [
  createNoteEvidenceFromCapture(
    {
      tenantId: demoTenantId,
      auditId: demoAuditId,
      checklistItemId: 'audit-template-item-planning',
      clauseRef: demoChecklistTemplate.items[1]!.clauseRef,
      note: 'Interviewed EHS manager about transition planning records; objective tracking evidence needs follow-up.',
      capturedBy: 'uid-omar-auditor',
      capturedAt: '2026-06-15T18:30:00.000Z',
      captureSource: 'offline',
      offlineLocalId: 'local-note-1',
      geo: {
        lat: 39.7392,
        lng: -104.9903,
        accuracyMeters: 12,
      },
    },
    'evidence-note-1',
  ),
];

export const demoFindings = [
  createFindingDraftFromFieldObservation(
    {
      tenantId: demoTenantId,
      auditId: demoAuditId,
      checklistItemId: 'audit-template-item-planning',
      clauseRef: demoChecklistTemplate.items[1]!.clauseRef,
      type: 'ofi',
      severity: 'opportunity',
      description: 'Transition planning evidence is partially available and should be completed before report signoff.',
      evidenceRefs: ['evidence-note-1'],
      createdBy: 'uid-omar-auditor',
      createdAt: '2026-06-15T18:40:00.000Z',
    },
    'finding-draft-1',
  ),
];

export const demoSyncQueue: SyncQueueItem[] = [
  {
    id: 'sync-evidence-note-1',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    collectionPath: `/tenants/${demoTenantId}/audits/${demoAuditId}/evidence`,
    documentId: 'evidence-note-1',
    operation: 'create',
    queuedBy: 'uid-omar-auditor',
    queuedAt: '2026-06-15T18:30:05.000Z',
    captureSource: 'offline',
    status: 'pending',
    retryCount: 0,
  },
];

export const demoConflict: OfflineConflict = {
  id: 'conflict-checklist-6',
  tenantId: demoTenantId,
  auditId: demoAuditId,
  documentPath: auditChecklistItemDocumentKey(demoTenantId, demoAuditId, 'audit-template-item-planning'),
  fieldPaths: ['result', 'updatedAt'],
  localChangedBy: 'uid-omar-auditor',
  remoteChangedBy: 'uid-maya-lead',
  detectedAt: '2026-06-15T19:02:00.000Z',
  resolution: 'manualReviewRequired',
};

export function displayNameForMember(uid: string): string {
  return demoMembers.find((member) => member.uid === uid)?.profile.displayName ?? 'Unassigned';
}
