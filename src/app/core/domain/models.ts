import { z } from 'zod';

import { tenantRoleSchema } from './roles.js';

export const isoEditionSchema = z.enum(['ISO_45001_2018', 'ISO_45001_2026']);
export type IsoEdition = z.infer<typeof isoEditionSchema>;

export const timestampSchema = z.union([z.date(), z.string().datetime()]);

export const auditStatusSchema = z.enum([
  'draft',
  'planned',
  'fieldwork',
  'reporting',
  'followUp',
  'closed',
  'archived',
]);

export const findingTypeSchema = z.enum(['conformity', 'minorNc', 'majorNc', 'ofi']);
export const findingStatusSchema = z.enum(['draft', 'auditorConfirmed', 'issued', 'closed']);
export const evidenceTypeSchema = z.enum(['photo', 'document', 'note', 'interview']);
export const capaStatusSchema = z.enum(['open', 'inProgress', 'verificationDue', 'verified', 'overdue']);

export const tenantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['active', 'suspended', 'trial']),
  plan: z.enum(['pilot', 'team', 'enterprise']),
  branding: z.object({
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  createdAt: timestampSchema,
});

export type Tenant = z.infer<typeof tenantSchema>;

export const memberSchema = z.object({
  uid: z.string().min(1),
  tenantId: z.string().min(1),
  role: tenantRoleSchema,
  profile: z.object({
    displayName: z.string().min(1),
    email: z.string().email(),
  }),
  status: z.enum(['invited', 'active', 'deactivated']),
  invitedBy: z.string().min(1).optional(),
  auditeeScope: z.array(z.string().min(1)).default([]),
  createdAt: timestampSchema,
});

export type Member = z.infer<typeof memberSchema>;

export const clauseRefSchema = z.object({
  standard: z.literal('ISO_45001'),
  edition: isoEditionSchema,
  clauseId: z.string().regex(/^[4-9](\.[0-9]+)*|10(\.[0-9]+)*$/),
  title: z.string().min(1),
});

export type ClauseRef = z.infer<typeof clauseRefSchema>;

export const auditeeSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  sites: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      address: z.string().min(1),
    }),
  ),
  contacts: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.string().min(1),
    }),
  ),
  status: z.enum(['active', 'archived']),
});

export type Auditee = z.infer<typeof auditeeSchema>;

export const auditSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  criteria: isoEditionSchema,
  scope: z.string().min(1),
  objectives: z.array(z.string().min(1)),
  assignedMembers: z.array(z.string().min(1)).min(1),
  leadAuditor: z.string().min(1),
  sectionOwners: z.record(z.string().min(1), z.string().min(1)).default({}),
  dates: z.object({
    startsAt: timestampSchema,
    endsAt: timestampSchema,
  }),
  status: auditStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Audit = z.infer<typeof auditSchema>;

export const findingSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  type: findingTypeSchema,
  clauseRef: clauseRefSchema,
  severity: z.enum(['none', 'minor', 'major', 'opportunity']),
  description: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
  status: findingStatusSchema,
  aiDraft: z
    .object({
      generatedAt: timestampSchema,
      model: z.string().min(1),
      promptHash: z.string().min(1),
      citations: z.array(z.string().min(1)),
    })
    .optional(),
  createdBy: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Finding = z.infer<typeof findingSchema>;

export const evidenceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  type: evidenceTypeSchema,
  storageRef: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  timestamp: timestampSchema,
  geo: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyMeters: z.number().nonnegative().optional(),
    })
    .optional(),
  createdBy: z.string().min(1),
  links: z.array(z.string().min(1)).default([]),
});

export type Evidence = z.infer<typeof evidenceSchema>;

export const capaSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  findingRef: z.string().min(1),
  rootCause: z.string().min(1).optional(),
  action: z.string().min(1),
  owner: z.string().min(1),
  dueDate: timestampSchema,
  verification: z.string().min(1).optional(),
  status: capaStatusSchema,
});

export type Capa = z.infer<typeof capaSchema>;
