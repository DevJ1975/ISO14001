import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Worker consultation & participation register (ISO 45001 cl. 5.4) — unique to
 * 45001 and a headline OH&S requirement: workers (and, where they exist, their
 * representatives) must be consulted on and participate in the OH&S management
 * system. This logs the topic, the mechanism used (safety committee, toolbox
 * talk, survey, direct consultation…), the worker group involved, and the
 * outcome, tenant- and audit-scoped with an auditor `result` and evidence refs.
 */
export const consultationTopicSchema = z.enum([
  'policy',
  'hazardIdentification',
  'riskAssessment',
  'controls',
  'incidentInvestigation',
  'training',
  'ppe',
  'emergencyArrangements',
  'changes',
  'other',
]);
export type ConsultationTopic = z.infer<typeof consultationTopicSchema>;

export const consultationMechanismSchema = z.enum([
  'safetyCommittee',
  'toolboxTalk',
  'survey',
  'rep',
  'directConsultation',
  'other',
]);
export type ConsultationMechanism = z.infer<typeof consultationMechanismSchema>;

export const workerConsultationSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  topic: z.string().min(1).max(300),
  category: consultationTopicSchema.default('other'),
  mechanism: consultationMechanismSchema.default('safetyCommittee'),
  workerGroup: z.string().max(300).optional(),
  participationEvidence: z.string().max(1000).optional(),
  outcome: z.string().max(1000).optional(),
  date: timestampSchema.optional(),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type WorkerConsultation = z.infer<typeof workerConsultationSchema>;
