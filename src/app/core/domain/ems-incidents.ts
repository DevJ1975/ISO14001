import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * Environmental incident / near-miss register — the incident-management module
 * that EHS platforms (Cority, Intelex, Ideagen) lead with. Distinct from
 * emergency *preparedness* (cl. 8.2): this logs incidents that actually
 * occurred (spills, releases, limit exceedances, near-misses), their immediate
 * action and root cause, linking to corrective action (cl. 10.2).
 */
export const incidentTypeSchema = z.enum([
  'spill',
  'release',
  'exceedance',
  'wasteBreach',
  'complaint',
  'nearMiss',
  'other',
]);
export type IncidentType = z.infer<typeof incidentTypeSchema>;

export const incidentSeveritySchema = z.enum(['low', 'medium', 'high']);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const incidentStatusSchema = z.enum(['open', 'investigating', 'actioned', 'closed']);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

const incidentDateSchema = z.union([z.string().date(), z.string().datetime(), z.date()]);

export const environmentalIncidentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  title: z.string().min(1).max(300),
  occurredAt: incidentDateSchema.optional(),
  location: z.string().max(300).optional(),
  incidentType: incidentTypeSchema.default('spill'),
  severity: incidentSeveritySchema.default('low'),
  description: z.string().max(2000).optional(),
  immediateAction: z.string().max(2000).optional(),
  rootCause: z.string().max(2000).optional(),
  correctiveActionRef: z.string().max(200).optional(),
  reportableToRegulator: z.boolean().optional(),
  status: incidentStatusSchema.default('open'),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type EnvironmentalIncident = z.infer<typeof environmentalIncidentSchema>;

const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ['open', 'investigating', 'actioned'];

/** True while the incident is not yet closed out. */
export function isIncidentOpen(incident: { status: IncidentStatus }): boolean {
  return OPEN_INCIDENT_STATUSES.includes(incident.status);
}
