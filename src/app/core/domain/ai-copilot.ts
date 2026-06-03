import { z } from 'zod';

import { clauseRefSchema, findingTypeSchema, isoEditionSchema, timestampSchema } from './models.js';
import { photoAiAnalysisSchema } from './photo-evidence.js';

export const aiProviderSchema = z.enum(['vertexGemini', 'anthropicClaude']);

export const aiReviewStatusSchema = z.enum([
  'draft',
  'needsAuditorReview',
  'accepted',
  'rejected',
  'superseded',
]);

export const aiCitationSchema = z.object({
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  docId: z.string().min(1),
  chunkId: z.string().min(1),
  sourceTitle: z.string().min(1),
  storageRef: z.string().min(1).optional(),
  relevanceScore: z.number().min(0).max(1),
});

export type AiCitation = z.infer<typeof aiCitationSchema>;

export const emsKnowledgeBaseDocSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  title: z.string().min(1),
  storageRef: z.string().min(1),
  status: z.enum(['queued', 'chunking', 'embedded', 'failed', 'archived']),
  embeddingNamespace: z.string().min(1),
  chunkCount: z.number().int().nonnegative(),
  uploadedBy: z.string().min(1),
  uploadedAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type EmsKnowledgeBaseDoc = z.infer<typeof emsKnowledgeBaseDocSchema>;

export const ragRetrievalRequestSchema = z.object({
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  requestedBy: z.string().min(1),
  query: z.string().min(3).max(1000),
  topK: z.number().int().min(1).max(12).default(5),
});

export type RagRetrievalRequest = z.infer<typeof ragRetrievalRequestSchema>;

export const ragRetrievalResultSchema = z
  .object({
    tenantId: z.string().min(1),
    auditeeId: z.string().min(1),
    query: z.string().min(3),
    citations: z.array(aiCitationSchema).min(1),
    generatedAt: timestampSchema,
  })
  .superRefine((result, context) => {
    for (const [index, citation] of result.citations.entries()) {
      if (citation.tenantId !== result.tenantId || citation.auditeeId !== result.auditeeId) {
        context.addIssue({
          code: 'custom',
          message: 'RAG citation must match the request tenant and auditee.',
          path: ['citations', index],
        });
      }
    }
  });

export type RagRetrievalResult = z.infer<typeof ragRetrievalResultSchema>;

export const emsQuestionAnswerSchema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    auditeeId: z.string().min(1),
    requestedBy: z.string().min(1),
    requestedAt: timestampSchema,
    provider: aiProviderSchema,
    model: z.string().min(1),
    question: z.string().min(3),
    answer: z.string().min(1),
    citations: z.array(aiCitationSchema).min(1),
    status: aiReviewStatusSchema,
  })
  .superRefine((answer, context) => {
    for (const [index, citation] of answer.citations.entries()) {
      if (citation.tenantId !== answer.tenantId || citation.auditeeId !== answer.auditeeId) {
        context.addIssue({
          code: 'custom',
          message: 'OH&S answer citation must match the answer tenant and auditee.',
          path: ['citations', index],
        });
      }
    }
  });

export type EmsQuestionAnswer = z.infer<typeof emsQuestionAnswerSchema>;

export const aiClauseSuggestionSchema = z.object({
  clauseRef: clauseRefSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export const aiSeveritySuggestionSchema = z.object({
  suggestedType: findingTypeSchema,
  suggestedSeverity: z.enum(['none', 'minor', 'major', 'opportunity']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export const aiFindingDraftSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  auditId: z.string().min(1),
  requestedBy: z.string().min(1),
  requestedAt: timestampSchema,
  provider: aiProviderSchema,
  model: z.string().min(1),
  promptHash: z.string().min(1),
  sourceEvidenceRefs: z.array(z.string().min(1)).min(1),
  observation: z.string().min(1),
  draftStatement: z.string().min(1),
  clauseSuggestions: z.array(aiClauseSuggestionSchema).min(1),
  severitySuggestion: aiSeveritySuggestionSchema,
  citations: z.array(aiCitationSchema).default([]),
  status: aiReviewStatusSchema,
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: timestampSchema.optional(),
});

export type AiFindingDraft = z.infer<typeof aiFindingDraftSchema>;

export const lineOfInquiryPromptSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  auditId: z.string().min(1),
  clauseRef: clauseRefSchema,
  prompt: z.string().min(1),
  rationale: z.string().min(1),
  citations: z.array(aiCitationSchema).default([]),
  status: aiReviewStatusSchema,
});

export type LineOfInquiryPrompt = z.infer<typeof lineOfInquiryPromptSchema>;

export const transitionGapCandidateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  fromEdition: z.literal('ISO_45001_2018'),
  toEdition: z.literal('ISO_45001_2026'),
  clauseRef: clauseRefSchema.extend({ edition: z.literal('ISO_45001_2026') }),
  summary: z.string().min(1),
  evidenceNeeded: z.array(z.string().min(1)).default([]),
  citations: z.array(aiCitationSchema).default([]),
  status: aiReviewStatusSchema,
});

export type TransitionGapCandidate = z.infer<typeof transitionGapCandidateSchema>;

export const aiCopilotReviewSchema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    auditeeId: z.string().min(1),
    auditId: z.string().min(1).optional(),
    sourceType: z.enum(['findingDraft', 'lineOfInquiry', 'transitionGap', 'photoAnalysis']),
    sourceId: z.string().min(1),
    status: z.enum(['accepted', 'rejected']),
    reviewedBy: z.string().min(1),
    reviewedAt: timestampSchema,
    reviewerNote: z.string().max(1000).optional(),
  })
  .superRefine((review, context) => {
    if (review.sourceType !== 'transitionGap' && !review.auditId) {
      context.addIssue({
        code: 'custom',
        message: 'Audit-scoped AI review requires auditId.',
        path: ['auditId'],
      });
    }
  });

export type AiCopilotReview = z.infer<typeof aiCopilotReviewSchema>;

export const aiCopilotFlowRequestSchema = z.object({
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  auditId: z.string().min(1).optional(),
  requestedBy: z.string().min(1),
  intent: z.enum([
    'emsQuestion',
    'findingDraft',
    'clauseMapping',
    'severityAssist',
    'lineOfInquiry',
    'transitionGap',
    'photoIdentification',
  ]),
  input: z.string().min(1),
  criteria: isoEditionSchema.default('ISO_45001_2026'),
});

export type AiCopilotFlowRequest = z.infer<typeof aiCopilotFlowRequestSchema>;

export const aiPhotoIdentificationResultSchema = photoAiAnalysisSchema.safeExtend({
  status: z.literal('needsAuditorReview'),
});

export function hasTenantIsolatedCitations(
  tenantId: string,
  auditeeId: string,
  citations: AiCitation[],
): boolean {
  return citations.every((citation) => citation.tenantId === tenantId && citation.auditeeId === auditeeId);
}

export function markAiDraftReviewed<T extends { status: string }>(
  draft: T,
  status: 'accepted' | 'rejected',
  reviewedBy: string,
  reviewedAt: string,
): T & { status: 'accepted' | 'rejected'; reviewedBy: string; reviewedAt: string } {
  return {
    ...draft,
    status,
    reviewedBy,
    reviewedAt,
  };
}
