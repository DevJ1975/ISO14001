import { z } from 'zod';

import { clauseRefSchema, isoEditionSchema, timestampSchema } from './models.js';

export const checklistTemplateStatusSchema = z.enum(['draft', 'active', 'archived']);

export const checklistQuestionSourceSchema = z.enum([
  'customerAuthored',
  'trainovateGenerated',
  'licensedContent',
]);

export const evidencePromptSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  required: z.boolean().default(false),
});

export const checklistTemplateItemSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  templateId: z.string().min(1),
  clauseRef: clauseRefSchema,
  question: z.string().min(8).max(300),
  guidance: z.string().max(500).optional(),
  evidencePrompts: z.array(evidencePromptSchema).default([]),
  source: checklistQuestionSourceSchema,
  sortOrder: z.number().int().nonnegative(),
  createdBy: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type ChecklistTemplateItem = z.infer<typeof checklistTemplateItemSchema>;

export const checklistTemplateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  criteria: isoEditionSchema,
  status: checklistTemplateStatusSchema,
  items: z.array(checklistTemplateItemSchema).min(1),
  createdBy: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;

export const checklistItemResultSchema = z.enum([
  'notStarted',
  'conforming',
  'nonconforming',
  'notApplicable',
  'needsFollowUp',
]);

export const auditChecklistItemSchema = checklistTemplateItemSchema
  .omit({ templateId: true, source: true })
  .extend({
    auditId: z.string().min(1),
    templateItemId: z.string().min(1),
    result: checklistItemResultSchema.default('notStarted'),
    ownerUid: z.string().min(1).optional(),
    evidenceRefs: z.array(z.string().min(1)).default([]),
    findingRefs: z.array(z.string().min(1)).default([]),
  });

export type AuditChecklistItem = z.infer<typeof auditChecklistItemSchema>;

export const checklistContentGuardrail = {
  allowed: 'Clause identifiers, clause titles, and original or licensed checklist questions.',
  prohibited: 'Unlicensed ISO requirements text or extended standard excerpts.',
} as const;
