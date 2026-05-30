import {
  BackendJob,
  CallableFunctionContract,
  EvidenceUploadIntent,
  PhaseSixReadinessItem,
  buildEvidenceMetadataPath,
  buildPhotoEvidenceStorageRef,
  evidenceUploadIntentCommandSchema,
} from '../../core/domain';
import { demoTenantId } from './phase-one-demo';
import { demoAuditId } from './phase-two-demo';

const demoEvidenceUploadCommand = evidenceUploadIntentCommandSchema.parse({
  tenantId: demoTenantId,
  auditId: demoAuditId,
  auditeeId: 'auditee-harbor',
  checklistItemId: 'audit-item-operation-8',
  fileName: 'secondary-containment-area.jpg',
  mimeType: 'image/jpeg',
  byteSize: 1_284_112,
  sha256: 'd1f55f64a7a8f2cfc8fef64d16a64716cce733f367e5062b467f2a6acdbff7d1',
  capturedByUid: 'uid-ava-auditor',
  capturedAt: '2026-06-21T19:04:00.000Z',
  offlineLocalId: 'local-photo-phase-six',
  idempotencyKey: 'phase-six-upload-001',
});

export const demoMongoCollections = [
  'tenants',
  'members',
  'audits',
  'evidence',
  'evidenceUploadIntents',
  'photoAnalyses',
  'reports',
  'capaReminders',
  'backendJobs',
] as const;

export const demoCallableFunctionContracts: CallableFunctionContract[] = [
  {
    name: 'createTenant',
    ownerRole: 'platformSuperadmin',
    status: 'emulatorReady',
    serverChecks: ['platform actor', 'tenant id uniqueness', 'tenant admin bootstrap'],
    writes: ['tenants', 'members', 'backendJobs'],
  },
  {
    name: 'inviteTenantMember',
    ownerRole: 'tenantAdmin',
    status: 'emulatorReady',
    serverChecks: ['same tenant', 'allowed role', 'invite expiration'],
    writes: ['invites', 'backendJobs'],
  },
  {
    name: 'assignMemberClaims',
    ownerRole: 'tenantAdmin',
    status: 'emulatorReady',
    serverChecks: ['same tenant', 'tenant admin role', 'reason captured'],
    writes: ['members', 'backendJobs'],
  },
  {
    name: 'createEvidenceUploadIntent',
    ownerRole: 'auditor',
    status: 'emulatorReady',
    serverChecks: ['same tenant', 'audit assignment', 'photo mime and size'],
    writes: ['evidenceUploadIntents', 'backendJobs'],
  },
  {
    name: 'requestPhotoAnalysis',
    ownerRole: 'auditor',
    status: 'planned',
    serverChecks: ['same tenant', 'evidence ownership', 'AI review output only'],
    writes: ['photoAnalyses', 'backendJobs'],
  },
  {
    name: 'generateAuditReportPdf',
    ownerRole: 'leadAuditor',
    status: 'planned',
    serverChecks: ['lead auditor role', 'report belongs to audit', 'signed PDF provenance'],
    writes: ['reports', 'backendJobs'],
  },
  {
    name: 'scheduleCapaReminder',
    ownerRole: 'leadAuditor',
    status: 'planned',
    serverChecks: ['same tenant', 'CAPA ownership', 'future reminder time'],
    writes: ['capaReminders', 'backendJobs'],
  },
];

export const demoEvidenceUploadIntent: EvidenceUploadIntent = {
  id: 'upload-phase-six-1',
  tenantId: demoTenantId,
  auditId: demoAuditId,
  evidenceId: 'evidence-phase-six-photo-1',
  storageRef: buildPhotoEvidenceStorageRef(demoEvidenceUploadCommand, 'evidence-phase-six-photo-1'),
  metadataPath: buildEvidenceMetadataPath(demoEvidenceUploadCommand, 'evidence-phase-six-photo-1'),
  status: 'created',
  createdByUid: 'uid-ava-auditor',
  createdAt: '2026-06-21T19:05:00.000Z',
  expiresAt: '2026-06-21T19:35:00.000Z',
};

export const demoBackendJobs: BackendJob[] = [
  {
    id: 'job-upload-intent-1',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    callableName: 'createEvidenceUploadIntent',
    requestedByUid: 'uid-ava-auditor',
    status: 'queued',
    idempotencyKey: 'phase-six-upload-001',
    retryCount: 0,
    createdAt: '2026-06-21T19:05:00.000Z',
    updatedAt: '2026-06-21T19:05:00.000Z',
    resultRef: demoEvidenceUploadIntent.metadataPath,
  },
  {
    id: 'job-photo-ai-1',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    callableName: 'requestPhotoAnalysis',
    requestedByUid: 'uid-ava-auditor',
    status: 'queued',
    idempotencyKey: 'phase-six-photo-ai-001',
    retryCount: 0,
    createdAt: '2026-06-21T19:06:00.000Z',
    updatedAt: '2026-06-21T19:06:00.000Z',
    resultRef: `/tenants/${demoTenantId}/audits/${demoAuditId}/photoAnalyses/evidence-phase-six-photo-1`,
  },
  {
    id: 'job-report-pdf-1',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    callableName: 'generateAuditReportPdf',
    requestedByUid: 'uid-maya-lead',
    status: 'queued',
    idempotencyKey: 'phase-six-report-pdf-001',
    retryCount: 0,
    createdAt: '2026-06-21T19:07:00.000Z',
    updatedAt: '2026-06-21T19:07:00.000Z',
    resultRef: `/tenants/${demoTenantId}/audits/${demoAuditId}/reports/report-transition-1`,
  },
];

export const demoPhaseSixReadiness: PhaseSixReadinessItem[] = [
  {
    id: 'mongo-uri-secret',
    title: 'MongoDB URI is server-only',
    requiredForProduction: true,
    status: 'emulatorReady',
    evidenceRefs: ['server/config.ts', '.env.example'],
  },
  {
    id: 'api-tenant-guards',
    title: 'API enforces tenant and role checks before MongoDB writes',
    requiredForProduction: true,
    status: 'emulatorReady',
    evidenceRefs: ['server/auth.ts', 'server/routes.ts'],
  },
  {
    id: 'mongo-indexes',
    title: 'MongoDB indexes support tenant-scoped audit queries and job queues',
    requiredForProduction: true,
    status: 'emulatorReady',
    evidenceRefs: ['server/collections.ts'],
  },
  {
    id: 'jwt-provider',
    title: 'Production JWT verifier selected and wired',
    requiredForProduction: true,
    status: 'planned',
    evidenceRefs: [],
  },
  {
    id: 'file-storage-worker',
    title: 'GridFS or object-storage worker receives photo bytes',
    requiredForProduction: true,
    status: 'planned',
    evidenceRefs: [],
  },
];
