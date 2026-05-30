import { z } from 'zod';

import {
  capaSchema,
  clauseRefSchema,
  findingTypeSchema,
  isoEditionSchema,
  timestampSchema,
} from './models.js';

export const reportStatusSchema = z.enum(['draft', 'generated', 'signed', 'void']);

export const reportSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1).max(120),
  body: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).default([]),
  sortOrder: z.number().int().nonnegative(),
});

export const reportFindingSummarySchema = z.object({
  findingId: z.string().min(1),
  type: findingTypeSchema,
  clauseRef: clauseRefSchema,
  severity: z.enum(['none', 'minor', 'major', 'opportunity']),
  status: z.enum(['draft', 'auditorConfirmed', 'issued', 'closed']),
});

export const auditReportSchema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    auditId: z.string().min(1),
    auditeeId: z.string().min(1),
    criteria: isoEditionSchema,
    version: z.number().int().positive(),
    status: reportStatusSchema,
    generatedBy: z.string().min(1),
    generatedAt: timestampSchema,
    sections: z.array(reportSectionSchema).min(1),
    findingSummaries: z.array(reportFindingSummarySchema).default([]),
    capaRefs: z.array(z.string().min(1)).default([]),
    transitionGapRefs: z.array(z.string().min(1)).default([]),
    pdfStorageRef: z.string().min(1).optional(),
    signedBy: z.string().min(1).optional(),
    signedAt: timestampSchema.optional(),
  })
  .superRefine((report, context) => {
    if (report.status === 'signed') {
      if (!report.signedBy || !report.signedAt || !report.pdfStorageRef) {
        context.addIssue({
          code: 'custom',
          message: 'Signed reports require signedBy, signedAt, and pdfStorageRef.',
          path: ['status'],
        });
      }
    }
  });

export type AuditReport = z.infer<typeof auditReportSchema>;

export const reportGenerationCommandSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  auditeeId: z.string().min(1),
  criteria: isoEditionSchema,
  generatedBy: z.string().min(1),
  findingRefs: z.array(z.string().min(1)).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  capaRefs: z.array(z.string().min(1)).default([]),
  transitionGapRefs: z.array(z.string().min(1)).default([]),
});

export type ReportGenerationCommand = z.infer<typeof reportGenerationCommandSchema>;

export const leadAuditorSignoffSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  reportId: z.string().min(1),
  signedBy: z.string().min(1),
  signedAt: timestampSchema,
  pdfStorageRef: z.string().min(1),
  attestation: z.string().min(20).max(1000),
});

export type LeadAuditorSignoff = z.infer<typeof leadAuditorSignoffSchema>;

export const correctiveActionSchema = capaSchema.extend({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  findingRef: z.string().min(1),
  verificationEvidenceRefs: z.array(z.string().min(1)).default([]),
  remindersEnabled: z.boolean().default(true),
});

export type CorrectiveAction = z.infer<typeof correctiveActionSchema>;

export const capaReminderSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  capaId: z.string().min(1),
  owner: z.string().min(1),
  dueDate: timestampSchema,
  sendAt: timestampSchema,
  channel: z.enum(['email', 'fcm']),
  status: z.enum(['scheduled', 'sent', 'cancelled', 'failed']),
});

export type CapaReminder = z.infer<typeof capaReminderSchema>;

export const transitionGapReportSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditeeId: z.string().min(1),
  auditId: z.string().min(1),
  fromEdition: z.literal('ISO_14001_2015'),
  toEdition: z.literal('ISO_14001_2026'),
  gapCandidateRefs: z.array(z.string().min(1)),
  summary: z.string().min(1),
  evidenceNeeded: z.array(z.string().min(1)).default([]),
  status: z.enum(['draft', 'reviewed', 'includedInReport']),
});

export type TransitionGapReport = z.infer<typeof transitionGapReportSchema>;

export function createDraftAuditReport(
  command: ReportGenerationCommand,
  reportId: string,
  generatedAt: string,
): AuditReport {
  return auditReportSchema.parse({
    id: reportId,
    tenantId: command.tenantId,
    auditId: command.auditId,
    auditeeId: command.auditeeId,
    criteria: command.criteria,
    version: 1,
    status: 'draft',
    generatedBy: command.generatedBy,
    generatedAt,
    sections: [
      {
        id: 'executive-summary',
        heading: 'Executive summary',
        body: 'Draft report generated from confirmed audit records and pending lead-auditor review.',
        sourceRefs: [...command.findingRefs, ...command.evidenceRefs],
        sortOrder: 10,
      },
    ],
    capaRefs: command.capaRefs,
    transitionGapRefs: command.transitionGapRefs,
  });
}

export function signAuditReport(report: AuditReport, signoff: LeadAuditorSignoff): AuditReport {
  return auditReportSchema.parse({
    ...report,
    status: 'signed',
    signedBy: signoff.signedBy,
    signedAt: signoff.signedAt,
    pdfStorageRef: signoff.pdfStorageRef,
  });
}

export function isCapaOverdue(capa: CorrectiveAction, now: string): boolean {
  return new Date(capa.dueDate).getTime() < new Date(now).getTime() && capa.status !== 'verified';
}
