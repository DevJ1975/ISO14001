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
  /** Justified planned audit-days for this certification audit (IAF MD 5). */
  plannedDays: z.number().min(0).max(1000).optional(),
  /** Audit-days actually spent, reconciled against the plan. */
  actualDays: z.number().min(0).max(1000).optional(),
});
export type PlannedAudit = z.infer<typeof plannedAuditSchema>;

/**
 * Audit-day variance = actual − planned. Positive means the audit ran over its
 * justified time; negative means under. Returns 0 when either side is unset so
 * an unplanned/unrecorded row contributes nothing to a roll-up.
 */
export function auditDayVariance(planned?: number, actual?: number): number {
  if (!Number.isFinite(planned) || !Number.isFinite(actual)) return 0;
  return (actual as number) - (planned as number);
}

export interface PlannedTimeSummary {
  totalPlanned: number;
  totalActual: number;
  variance: number;
  overCount: number;
  underCount: number;
}

/**
 * Roll-up of planned vs actual audit-days across the planned-audit entries:
 * totals, net variance (actual − planned) and counts of rows over/under their plan.
 * Undefined-safe: rows missing either figure simply add nothing.
 */
export function summarisePlannedTime(
  plannedAudits: readonly { plannedDays?: number; actualDays?: number }[] = [],
): PlannedTimeSummary {
  let totalPlanned = 0;
  let totalActual = 0;
  let overCount = 0;
  let underCount = 0;
  for (const audit of plannedAudits) {
    if (Number.isFinite(audit.plannedDays)) totalPlanned += audit.plannedDays as number;
    if (Number.isFinite(audit.actualDays)) totalActual += audit.actualDays as number;
    if (Number.isFinite(audit.plannedDays) && Number.isFinite(audit.actualDays)) {
      const variance = auditDayVariance(audit.plannedDays, audit.actualDays);
      if (variance > 0) overCount += 1;
      else if (variance < 0) underCount += 1;
    }
  }
  return { totalPlanned, totalActual, variance: totalActual - totalPlanned, overCount, underCount };
}

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
