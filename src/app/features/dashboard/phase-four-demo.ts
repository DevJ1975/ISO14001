import {
  CapaReminder,
  CorrectiveAction,
  createDraftAuditReport,
  LeadAuditorSignoff,
  signAuditReport,
  TransitionGapReport,
} from '../../core/domain';
import { demoAuditSetup, demoTenantId } from './phase-one-demo';
import { demoAuditId, demoFindings } from './phase-two-demo';
import { demoAuditeeId, demoTransitionGap } from './phase-three-demo';

export const demoReportDraft = createDraftAuditReport(
  {
    tenantId: demoTenantId,
    auditId: demoAuditId,
    auditeeId: demoAuditeeId,
    criteria: demoAuditSetup.criteria,
    generatedBy: demoAuditSetup.leadAuditor,
    findingRefs: demoFindings.map((finding) => finding.id),
    evidenceRefs: ['evidence-note-1'],
    capaRefs: ['capa-transition-planning'],
    transitionGapRefs: [demoTransitionGap.id],
  },
  'report-transition-1',
  '2026-06-17T21:00:00.000Z',
);

export const demoReportSignoff: LeadAuditorSignoff = {
  tenantId: demoTenantId,
  auditId: demoAuditId,
  reportId: demoReportDraft.id,
  signedBy: demoAuditSetup.leadAuditor,
  signedAt: '2026-06-17T22:30:00.000Z',
  pdfStorageRef: `tenants/${demoTenantId}/audits/${demoAuditId}/reports/report-transition-1-v1.pdf`,
  attestation: 'I confirm this report has been reviewed and approved by the lead auditor.',
};

export const demoSignedReport = signAuditReport(demoReportDraft, demoReportSignoff);

export const demoCorrectiveActions: CorrectiveAction[] = [
  {
    id: 'capa-transition-planning',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    findingRef: 'finding-draft-1',
    rootCause: 'Transition planning owner and record update cadence need clarification.',
    action: 'Update objective tracker ownership and attach current planning evidence before final verification.',
    owner: 'elena.ruiz@northstar.example',
    dueDate: '2026-07-15T23:59:00.000Z',
    verification: 'Lead auditor verifies updated tracker and owner acknowledgement.',
    verificationEvidenceRefs: [],
    remindersEnabled: true,
    status: 'open',
  },
  {
    id: 'capa-secondary-containment',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    findingRef: 'photo-analysis-1',
    action: 'Provide current inspection record for PPE signage and entry controls reviewed during fieldwork.',
    owner: 'maintenance.lead@northstar.example',
    dueDate: '2026-07-01T23:59:00.000Z',
    verificationEvidenceRefs: ['evidence-photo-1'],
    remindersEnabled: true,
    status: 'verificationDue',
  },
];

export const demoCapaReminders: CapaReminder[] = [
  {
    id: 'reminder-capa-transition-planning',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    capaId: 'capa-transition-planning',
    owner: 'elena.ruiz@northstar.example',
    dueDate: '2026-07-15T23:59:00.000Z',
    sendAt: '2026-07-08T16:00:00.000Z',
    channel: 'email',
    status: 'scheduled',
  },
  {
    id: 'reminder-capa-secondary-containment',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    capaId: 'capa-secondary-containment',
    owner: 'maintenance.lead@northstar.example',
    dueDate: '2026-07-01T23:59:00.000Z',
    sendAt: '2026-06-28T16:00:00.000Z',
    channel: 'fcm',
    status: 'scheduled',
  },
];

export const demoTransitionGapReport: TransitionGapReport = {
  id: 'transition-gap-report-1',
  tenantId: demoTenantId,
  auditeeId: demoAuditeeId,
  auditId: demoAuditId,
  fromEdition: 'ISO_45001_2018',
  toEdition: 'ISO_45001_2026',
  gapCandidateRefs: [demoTransitionGap.id],
  summary: 'Transition readiness review should focus on planning records, ownership evidence, and objective update cadence.',
  evidenceNeeded: demoTransitionGap.evidenceNeeded,
  status: 'draft',
};
