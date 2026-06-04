import { z } from 'zod';

import { isoEditionSchema, timestampSchema } from './models.js';

export const auditTypeSchema = z.enum([
  'internal',
  'certificationStage1',
  'certificationStage2',
  'surveillance',
  'recertification',
  'special',
]);
export type AuditType = z.infer<typeof auditTypeSchema>;

export const plannedAuditStatusSchema = z.enum(['planned', 'inProgress', 'completed', 'cancelled']);

export const plannedAuditSchema = z.object({
  id: z.string().min(1),
  type: auditTypeSchema,
  dueDate: timestampSchema,
  status: plannedAuditStatusSchema.default('planned'),
  auditId: z.string().min(1).optional(),
  priorAuditId: z.string().min(1).optional(),
});
export type PlannedAudit = z.infer<typeof plannedAuditSchema>;

export const auditProgrammeSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  cycleYear: z.number().int(),
  criteria: isoEditionSchema,
  plannedAudits: z.array(plannedAuditSchema).default([]),
  status: z.enum(['active', 'closed']).default('active'),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type AuditProgramme = z.infer<typeof auditProgrammeSchema>;

/**
 * ISO 45001 cl. 9.2 — the auditee's own internal-audit programme. Distinct from the
 * certification/surveillance schedule above: a risk-based plan covering the whole OH&S
 * system, run by competent and impartial internal auditors, with findings followed up.
 */
export const internalAuditStatusSchema = z.enum(['planned', 'inProgress', 'completed', 'overdue']);
export type InternalAuditStatus = z.infer<typeof internalAuditStatusSchema>;

export const internalAuditSchema = z.object({
  id: z.string().min(1),
  scopeArea: z.string().max(300).default(''),
  plannedDate: z.string().max(40).default(''),
  status: internalAuditStatusSchema.default('planned'),
  auditorName: z.string().max(200).optional(),
  impartialityConfirmed: z.boolean().optional(),
  findingsSummary: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});
export type InternalAudit = z.infer<typeof internalAuditSchema>;

/** True when a not-yet-completed internal audit is past its planned date. */
export function isInternalAuditOverdue(
  item: { status: InternalAuditStatus; plannedDate?: string | Date },
  now: string | Date = new Date(),
): boolean {
  if (item.status === 'completed') return false;
  if (!item.plannedDate) return false;
  const planned = new Date(item.plannedDate).getTime();
  if (Number.isNaN(planned)) return false;
  return planned < new Date(now).getTime();
}

export const auditorCompetenceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  memberUid: z.string().min(1),
  auditId: z.string().min(1).optional(),
  competenceNotes: z.string().max(2000).optional(),
  qualifications: z.array(z.string().min(1)).default([]),
  impartialityDeclaredAt: timestampSchema.optional(),
  updatedAt: timestampSchema,
});
export type AuditorCompetence = z.infer<typeof auditorCompetenceSchema>;

export function addMonthsISO(fromISO: string, months: number): string {
  const date = new Date(fromISO);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

/** ISO/IEC 17021-1 cadence: surveillance ~annually; recertification before the 3-year cycle ends. */
export function surveillanceDue(lastAuditISO: string): string {
  return addMonthsISO(lastAuditISO, 12);
}

export function recertificationDue(certifiedAtISO: string): string {
  return addMonthsISO(certifiedAtISO, 36);
}
