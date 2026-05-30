import { z } from 'zod';

import { isoEditionSchema, timestampSchema } from './models.js';
import { maxPhotoEvidenceBytes, supportedPhotoMimeTypes } from './photo-evidence.js';
import { tenantRoleSchema } from './roles.js';

export const phaseSixCallableNameSchema = z.enum([
  'createTenant',
  'inviteTenantMember',
  'assignMemberClaims',
  'createEvidenceUploadIntent',
  'requestPhotoAnalysis',
  'generateAuditReportPdf',
  'scheduleCapaReminder',
]);

export type PhaseSixCallableName = z.infer<typeof phaseSixCallableNameSchema>;

export const requiredPhaseSixCallableNames = phaseSixCallableNameSchema.options;

export const backendActivationStatusSchema = z.enum(['planned', 'emulatorReady', 'deployed', 'blocked']);

export const callableFunctionContractSchema = z.object({
  name: phaseSixCallableNameSchema,
  ownerRole: z.enum(['platformSuperadmin', 'tenantAdmin', 'leadAuditor', 'auditor']),
  status: backendActivationStatusSchema,
  serverChecks: z.array(z.string().min(1)).min(1),
  writes: z.array(z.string().min(1)).min(1),
});

export type CallableFunctionContract = z.infer<typeof callableFunctionContractSchema>;

export const tenantOnboardingCommandSchema = z.object({
  tenantId: z.string().min(1),
  tenantName: z.string().min(1),
  plan: z.enum(['pilot', 'team', 'enterprise']),
  requestedByUid: z.string().min(1),
  adminUid: z.string().min(1),
  adminEmail: z.string().email(),
  createdAt: timestampSchema,
  idempotencyKey: z.string().min(12),
});

export type TenantOnboardingCommand = z.infer<typeof tenantOnboardingCommandSchema>;

export const tenantMemberInviteCommandSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  role: tenantRoleSchema,
  auditeeScope: z.array(z.string().min(1)).default([]),
  invitedByUid: z.string().min(1),
  expiresAt: timestampSchema,
  idempotencyKey: z.string().min(12),
});

export type TenantMemberInviteCommand = z.infer<typeof tenantMemberInviteCommandSchema>;

export const memberClaimsAssignmentCommandSchema = z.object({
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  role: tenantRoleSchema,
  assignedByUid: z.string().min(1),
  reason: z.string().min(10).max(500),
  idempotencyKey: z.string().min(12),
});

export type MemberClaimsAssignmentCommand = z.infer<typeof memberClaimsAssignmentCommandSchema>;

export const evidenceUploadIntentCommandSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  auditeeId: z.string().min(1),
  checklistItemId: z.string().min(1),
  fileName: z.string().min(1).max(160),
  mimeType: z.enum(supportedPhotoMimeTypes),
  byteSize: z.number().int().positive().max(maxPhotoEvidenceBytes),
  sha256: z.string().min(32),
  capturedByUid: z.string().min(1),
  capturedAt: timestampSchema,
  offlineLocalId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(12),
});

export type EvidenceUploadIntentCommand = z.infer<typeof evidenceUploadIntentCommandSchema>;

export const evidenceUploadIntentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  evidenceId: z.string().min(1),
  storageRef: z.string().min(1),
  metadataPath: z.string().min(1),
  status: z.enum(['created', 'uploading', 'uploaded', 'metadataWritten', 'failed']),
  createdByUid: z.string().min(1),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
});

export type EvidenceUploadIntent = z.infer<typeof evidenceUploadIntentSchema>;

export const photoAnalysisRequestCommandSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  auditeeId: z.string().min(1),
  evidenceId: z.string().min(1),
  requestedByUid: z.string().min(1),
  idempotencyKey: z.string().min(12),
});

export type PhotoAnalysisRequestCommand = z.infer<typeof photoAnalysisRequestCommandSchema>;

export const reportPdfGenerationCommandSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  auditeeId: z.string().min(1),
  reportId: z.string().min(1),
  criteria: isoEditionSchema,
  requestedByUid: z.string().min(1),
  idempotencyKey: z.string().min(12),
});

export type ReportPdfGenerationCommand = z.infer<typeof reportPdfGenerationCommandSchema>;

export const capaReminderScheduleCommandSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  capaId: z.string().min(1),
  channel: z.enum(['email', 'fcm']),
  sendAt: timestampSchema,
  requestedByUid: z.string().min(1),
  idempotencyKey: z.string().min(12),
});

export type CapaReminderScheduleCommand = z.infer<typeof capaReminderScheduleCommandSchema>;

export const backendJobSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1).optional(),
  callableName: phaseSixCallableNameSchema,
  requestedByUid: z.string().min(1),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  idempotencyKey: z.string().min(12),
  retryCount: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  resultRef: z.string().min(1).optional(),
  failureReason: z.string().min(1).optional(),
});

export type BackendJob = z.infer<typeof backendJobSchema>;

export const phaseSixReadinessItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  requiredForProduction: z.boolean(),
  status: backendActivationStatusSchema,
  evidenceRefs: z.array(z.string().min(1)).default([]),
});

export type PhaseSixReadinessItem = z.infer<typeof phaseSixReadinessItemSchema>;

export function buildPhotoEvidenceStorageRef(command: EvidenceUploadIntentCommand, evidenceId: string): string {
  const safeName = command.fileName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  const trimmedName = safeName.slice(Math.max(0, safeName.length - 80)) || 'photo-evidence';

  return `tenants/${command.tenantId}/audits/${command.auditId}/evidence/photos/${evidenceId}-${trimmedName}`;
}

export function buildEvidenceMetadataPath(command: EvidenceUploadIntentCommand, evidenceId: string): string {
  return `/tenants/${command.tenantId}/audits/${command.auditId}/evidence/${evidenceId}`;
}

export function hasRequiredCallableCoverage(contracts: CallableFunctionContract[]): boolean {
  const names = new Set(contracts.map((contract) => contract.name));
  return requiredPhaseSixCallableNames.every((name) => names.has(name));
}

export function isPhaseSixProductionReady(items: PhaseSixReadinessItem[]): boolean {
  return items.every((item) => !item.requiredForProduction || item.status === 'deployed');
}
