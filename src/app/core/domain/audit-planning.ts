import { z } from 'zod';

import { auditSchema, type Audit, isoEditionSchema, timestampSchema } from './models.js';

export const auditSetupCommandSchema = z
  .object({
    tenantId: z.string().min(1),
    auditeeId: z.string().min(1),
    templateId: z.string().min(1),
    criteria: isoEditionSchema,
    scope: z.string().min(1).max(600),
    objectives: z.array(z.string().min(1).max(180)).min(1),
    assignedMembers: z.array(z.string().min(1)).min(1),
    leadAuditor: z.string().min(1),
    sectionOwners: z.record(z.string().min(1), z.string().min(1)).default({}),
    dates: z.object({
      startsAt: timestampSchema,
      endsAt: timestampSchema,
    }),
  })
  .superRefine((command, context) => {
    if (!command.assignedMembers.includes(command.leadAuditor)) {
      context.addIssue({
        code: 'custom',
        message: 'Lead auditor must be included in the assigned audit team.',
        path: ['leadAuditor'],
      });
    }

    const assigned = new Set(command.assignedMembers);
    for (const [section, owner] of Object.entries(command.sectionOwners)) {
      if (!assigned.has(owner)) {
        context.addIssue({
          code: 'custom',
          message: `Section ${section} owner must be assigned to the audit.`,
          path: ['sectionOwners', section],
        });
      }
    }
  });

export type AuditSetupCommand = z.infer<typeof auditSetupCommandSchema>;

export function createPlannedAuditFromSetup(command: AuditSetupCommand, id: string, now: string): Audit {
  return auditSchema.parse({
    id,
    tenantId: command.tenantId,
    auditeeId: command.auditeeId,
    criteria: command.criteria,
    scope: command.scope,
    objectives: command.objectives,
    assignedMembers: command.assignedMembers,
    leadAuditor: command.leadAuditor,
    sectionOwners: command.sectionOwners,
    dates: command.dates,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  });
}
