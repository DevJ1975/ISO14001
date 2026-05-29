import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aiFindingDraftSchema,
  emsKnowledgeBaseDocSchema,
  emsQuestionAnswerSchema,
  hasTenantIsolatedCitations,
  markAiDraftReviewed,
  ragRetrievalResultSchema,
  transitionGapCandidateSchema,
} from '../src/app/core/domain';
import {
  demoAiFindingDraft,
  demoEmsAnswer,
  demoKnowledgeDocs,
  demoLineOfInquiry,
  demoPhotoAiAnalysis,
  demoRagResult,
  demoTransitionGap,
} from '../src/app/features/dashboard/phase-three-demo';

describe('phase 3 ai copilot', () => {
  it('validates tenant-scoped EMS knowledge-base documents', () => {
    const docs = demoKnowledgeDocs.map((doc) => emsKnowledgeBaseDocSchema.parse(doc));

    assert.equal(docs.length, 2);
    assert.equal(docs.every((doc) => doc.embeddingNamespace.includes(`${doc.tenantId}:${doc.auditeeId}`)), true);
  });

  it('accepts RAG results only when citations match tenant and auditee', () => {
    const result = ragRetrievalResultSchema.parse(demoRagResult);

    assert.equal(hasTenantIsolatedCitations(result.tenantId, result.auditeeId, result.citations), true);
  });

  it('rejects cross-tenant RAG citations', () => {
    const result = ragRetrievalResultSchema.safeParse({
      ...demoRagResult,
      citations: [
        {
          ...demoRagResult.citations[0],
          tenantId: 'tenant-other',
        },
      ],
    });

    assert.equal(result.success, false);
  });

  it('keeps EMS answers and AI finding drafts in review status', () => {
    const answer = emsQuestionAnswerSchema.parse(demoEmsAnswer);
    const draft = aiFindingDraftSchema.parse(demoAiFindingDraft);

    assert.equal(answer.status, 'needsAuditorReview');
    assert.equal(draft.status, 'needsAuditorReview');
    assert.equal(draft.clauseSuggestions[0]?.clauseRef.clauseId, '6');
  });

  it('marks AI drafts reviewed only with auditor attribution', () => {
    const reviewed = markAiDraftReviewed(demoAiFindingDraft, 'accepted', 'uid-maya-lead', '2026-06-15T21:00:00.000Z');

    assert.equal(reviewed.status, 'accepted');
    assert.equal(reviewed.reviewedBy, 'uid-maya-lead');
  });

  it('validates line of inquiry, transition gap, and photo review artifacts', () => {
    assert.equal(demoLineOfInquiry[0]?.status, 'needsAuditorReview');
    assert.equal(transitionGapCandidateSchema.parse(demoTransitionGap).toEdition, 'ISO_14001_2026');
    assert.equal(demoPhotoAiAnalysis.status, 'needsAuditorReview');
  });
});
