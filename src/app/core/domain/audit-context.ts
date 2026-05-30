import { z } from 'zod';

import { auditStatusSchema, isoEditionSchema, timestampSchema } from './models.js';

/** Lead-auditor recommendation. First three are for certification audits, last two for internal audits. */
export const recommendationSchema = z.enum([
  'recommend',
  'conditional',
  'notRecommended',
  'satisfactory',
  'actionRequired',
]);
export type Recommendation = z.infer<typeof recommendationSchema>;

export const auditTeamMemberSchema = z.object({
  uid: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['leadAuditor', 'auditor', 'technicalExpert', 'observer', 'trainee']),
  competenceNote: z.string().max(500).optional(),
});
export type AuditTeamMember = z.infer<typeof auditTeamMemberSchema>;

export const auditContextSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  auditeeId: z.string().min(1),
  scope: z.string().min(1).max(2000),
  criteria: isoEditionSchema,
  objectives: z.array(z.string().min(1)).default([]),
  sites: z.array(z.string().min(1)).default([]),
  areas: z.array(z.string().min(1)).default([]),
  team: z.array(auditTeamMemberSchema).default([]),
  startsAt: timestampSchema.optional(),
  endsAt: timestampSchema.optional(),
  status: auditStatusSchema.default('fieldwork'),
  updatedAt: timestampSchema,
});
export type AuditContext = z.infer<typeof auditContextSchema>;

export const meetingKindSchema = z.enum(['opening', 'closing']);
export type MeetingKind = z.infer<typeof meetingKindSchema>;

export const meetingRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  kind: meetingKindSchema,
  datetimeAt: timestampSchema,
  attendees: z.array(z.string().min(1)).default([]),
  agendaPoints: z.array(z.string().min(1)).default([]),
  notes: z.string().max(4000).optional(),
  acknowledged: z.boolean().default(false),
  recordedBy: z.string().min(1),
});
export type MeetingRecord = z.infer<typeof meetingRecordSchema>;

/** Audit conclusions per ISO 19011 6.5.7 (degree criteria met, conclusions, diverging opinions) + recommendation. */
export const auditConclusionSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  overallConformity: z.string().min(1).max(4000),
  findingCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  emsEffectivenessOpinion: z.string().max(4000).optional(),
  criteriaMetStatement: z.string().max(2000).optional(),
  divergingOpinions: z.string().max(2000).optional(),
  recommendation: recommendationSchema,
  signedBy: z.string().min(1).optional(),
  signedAt: timestampSchema.optional(),
  attestation: z.string().min(20).max(1000).optional(),
  updatedAt: timestampSchema,
});
export type AuditConclusion = z.infer<typeof auditConclusionSchema>;

const STATUS_ORDER = ['draft', 'planned', 'fieldwork', 'reporting', 'followUp', 'closed', 'archived'] as const;

/** Only forward (or same) lifecycle transitions are allowed. */
export function canTransitionAuditStatus(from: string, to: string): boolean {
  const fromIndex = STATUS_ORDER.indexOf(from as (typeof STATUS_ORDER)[number]);
  const toIndex = STATUS_ORDER.indexOf(to as (typeof STATUS_ORDER)[number]);
  return fromIndex >= 0 && toIndex >= 0 && toIndex >= fromIndex;
}
