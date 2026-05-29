import { z } from 'zod';

import { clauseRefSchema, evidenceSchema, timestampSchema } from './models';

export const supportedPhotoMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const maxPhotoEvidenceBytes = 25 * 1024 * 1024;

export const boundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const photoEvidenceSchema = evidenceSchema.extend({
  type: z.literal('photo'),
  storageRef: z.string().min(1),
  media: z.object({
    fileName: z.string().min(1),
    mimeType: z.enum(supportedPhotoMimeTypes),
    byteSize: z.number().int().positive().max(maxPhotoEvidenceBytes),
    widthPx: z.number().int().positive().optional(),
    heightPx: z.number().int().positive().optional(),
    sha256: z.string().min(32),
  }),
  capture: z.object({
    source: z.enum(['camera', 'upload']),
    capturedAt: timestampSchema,
    deviceLabel: z.string().min(1).optional(),
    offlineLocalId: z.string().min(1).optional(),
  }),
  aiAnalysisRef: z.string().min(1).optional(),
});

export type PhotoEvidence = z.infer<typeof photoEvidenceSchema>;

export const environmentalSignalSchema = z.enum([
  'chemicalStorage',
  'wasteContainer',
  'secondaryContainment',
  'spillOrStain',
  'dischargePoint',
  'airEmissionPoint',
  'stormwaterControl',
  'erosionSedimentControl',
  'labelOrSignage',
  'housekeeping',
  'vegetationOrHabitat',
  'unknown',
]);

export const photoAiAnalysisStatusSchema = z.enum([
  'queued',
  'processing',
  'needsAuditorReview',
  'accepted',
  'rejected',
  'failed',
]);

export const photoAiObservationSchema = z.object({
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  signal: environmentalSignalSchema,
  boundingBox: boundingBoxSchema.optional(),
  rationale: z.string().min(1),
});

export const photoAiFindingCandidateSchema = z.object({
  summary: z.string().min(1),
  suggestedType: z.enum(['conformity', 'minorNc', 'majorNc', 'ofi']),
  suggestedSeverity: z.enum(['none', 'minor', 'major', 'opportunity']),
  clauseSuggestions: z.array(
    z.object({
      clauseRef: clauseRefSchema,
      rationale: z.string().min(1),
    }),
  ),
  evidenceRationale: z.string().min(1),
});

export const photoAiAnalysisSchema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    auditeeId: z.string().min(1),
    auditId: z.string().min(1),
    evidenceId: z.string().min(1),
    storageRef: z.string().min(1),
    imageHash: z.string().min(32),
    status: photoAiAnalysisStatusSchema,
    requestedBy: z.string().min(1),
    requestedAt: timestampSchema,
    provider: z.enum(['vertexGemini', 'anthropicClaude']).default('vertexGemini'),
    model: z.string().min(1),
    promptHash: z.string().min(1),
    generatedAt: timestampSchema.optional(),
    observations: z.array(photoAiObservationSchema).default([]),
    detectedText: z.array(z.string().min(1)).default([]),
    findingCandidates: z.array(photoAiFindingCandidateSchema).default([]),
    failureReason: z.string().min(1).optional(),
    reviewedBy: z.string().min(1).optional(),
    reviewedAt: timestampSchema.optional(),
  })
  .superRefine((analysis, context) => {
    if (analysis.status === 'accepted' || analysis.status === 'rejected') {
      if (!analysis.reviewedBy || !analysis.reviewedAt) {
        context.addIssue({
          code: 'custom',
          message: 'Auditor review attribution is required before accepting or rejecting AI photo analysis.',
          path: ['reviewedBy'],
        });
      }
    }

    if (analysis.status === 'failed' && !analysis.failureReason) {
      context.addIssue({
        code: 'custom',
        message: 'Failed AI photo analysis requires a failure reason.',
        path: ['failureReason'],
      });
    }
  });

export type PhotoAiAnalysis = z.infer<typeof photoAiAnalysisSchema>;
