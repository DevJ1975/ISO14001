import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { timestampSchema } from './models.js';

/**
 * OH&S incident, near-miss & investigation register — the module that safety
 * platforms (Cority, Intelex, Ideagen) lead with. Distinct from emergency
 * *preparedness* (cl. 8.2): this logs events that actually occurred (injuries,
 * ill-health, near-misses, dangerous occurrences), their immediate action,
 * investigation and root cause, linking to corrective action (ISO 45001 cl. 10.2).
 */
export const incidentTypeSchema = z.enum([
  'injury',
  'illHealth',
  'nearMiss',
  'dangerousOccurrence',
  'propertyDamage',
  'fatality',
  'other',
]);
export type IncidentType = z.infer<typeof incidentTypeSchema>;

export const incidentSeveritySchema = z.enum(['low', 'medium', 'high']);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

/** Injury classification, ascending in seriousness; `riddor` flags a reportable event. */
export const injuryClassificationSchema = z.enum([
  'none',
  'firstAid',
  'medicalTreatment',
  'lostTime',
  'riddor',
]);
export type InjuryClassification = z.infer<typeof injuryClassificationSchema>;

export const rootCauseMethodSchema = z.enum(['fiveWhys', 'fishbone', 'taproot', 'other']);
export type RootCauseMethod = z.infer<typeof rootCauseMethodSchema>;

export const incidentStatusSchema = z.enum(['open', 'investigating', 'actioned', 'closed']);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

const incidentDateSchema = z.union([z.string().date(), z.string().datetime(), z.date()]);

export const incidentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  title: z.string().min(1).max(300),
  occurredAt: incidentDateSchema.optional(),
  location: z.string().max(300).optional(),
  incidentType: incidentTypeSchema.default('nearMiss'),
  severity: incidentSeveritySchema.default('low'),
  injuryClassification: injuryClassificationSchema.default('none'),
  bodyPart: z.string().max(200).optional(),
  lostDays: z.number().int().min(0).optional(),
  description: z.string().max(2000).optional(),
  immediateAction: z.string().max(2000).optional(),
  rootCause: z.string().max(2000).optional(),
  rootCauseMethod: rootCauseMethodSchema.optional(),
  investigator: z.string().max(300).optional(),
  investigationFindings: z.string().max(2000).optional(),
  correctiveActionRef: z.string().max(200).optional(),
  riddorReportable: z.boolean().optional(),
  status: incidentStatusSchema.default('open'),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type Incident = z.infer<typeof incidentSchema>;

const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ['open', 'investigating', 'actioned'];

/** True while the incident is not yet closed out. */
export function isIncidentOpen(incident: { status: IncidentStatus }): boolean {
  return OPEN_INCIDENT_STATUSES.includes(incident.status);
}
