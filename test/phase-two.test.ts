import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canCaptureForClause,
  createFindingDraftFromFieldObservation,
  createNoteEvidenceFromCapture,
  fieldExecutionSessionSchema,
  offlineConflictSchema,
  syncQueueItemSchema,
} from '../src/app/core/domain';
import { demoChecklistTemplate } from '../src/app/features/dashboard/phase-one-demo';
import {
  demoAuditId,
  demoChecklistExecutionItems,
  demoConflict,
  demoEvidence,
  demoFieldSession,
  demoFindings,
  demoSyncQueue,
} from '../src/app/features/dashboard/phase-two-demo';

describe('phase 2 field execution', () => {
  it('keeps checklist execution rows attributed to the audit and tenant', () => {
    assert.equal(demoChecklistExecutionItems.every((item) => item.auditId === demoAuditId), true);
    assert.equal(demoChecklistExecutionItems.every((item) => item.tenantId === demoFieldSession.tenantId), true);
  });

  it('allows assigned section owners to capture and blocks unassigned users', () => {
    const session = fieldExecutionSessionSchema.parse(demoFieldSession);

    assert.equal(canCaptureForClause(session, 'uid-omar-auditor', '6'), true);
    assert.equal(canCaptureForClause(session, 'uid-ava-auditor', '6'), false);
    assert.equal(canCaptureForClause(session, 'uid-not-assigned', '6'), false);
  });

  it('creates note evidence linked to checklist and clause references', () => {
    const clauseRef = demoChecklistTemplate.items[1]!.clauseRef;
    const evidence = createNoteEvidenceFromCapture(
      {
        tenantId: demoFieldSession.tenantId,
        auditId: demoAuditId,
        checklistItemId: 'audit-template-item-planning',
        clauseRef,
        note: 'Offline interview note captured during field execution.',
        capturedBy: 'uid-omar-auditor',
        capturedAt: '2026-06-15T18:30:00.000Z',
        captureSource: 'offline',
      },
      'evidence-note-test',
    );

    assert.equal(evidence.type, 'note');
    assert.deepEqual(evidence.links, ['audit-template-item-planning', clauseRef.clauseId]);
  });

  it('creates draft findings from field observations without issuing them', () => {
    const finding = createFindingDraftFromFieldObservation(
      {
        tenantId: demoFieldSession.tenantId,
        auditId: demoAuditId,
        checklistItemId: 'audit-template-item-planning',
        clauseRef: demoChecklistTemplate.items[1]!.clauseRef,
        type: 'ofi',
        severity: 'opportunity',
        description: 'Planning evidence requires follow-up before report signoff.',
        evidenceRefs: ['evidence-note-test'],
        createdBy: 'uid-omar-auditor',
        createdAt: '2026-06-15T18:40:00.000Z',
      },
      'finding-test',
    );

    assert.equal(finding.status, 'draft');
    assert.equal(finding.evidenceRefs[0], 'evidence-note-test');
  });

  it('validates demo evidence, findings, sync queue, and conflict records', () => {
    assert.equal(demoEvidence.length, 1);
    assert.equal(demoFindings[0]?.status, 'draft');
    assert.equal(syncQueueItemSchema.parse(demoSyncQueue[0]).status, 'pending');
    assert.equal(offlineConflictSchema.parse(demoConflict).resolution, 'manualReviewRequired');
  });
});
