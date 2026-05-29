import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auditReportSchema,
  capaReminderSchema,
  correctiveActionSchema,
  createDraftAuditReport,
  isCapaOverdue,
  leadAuditorSignoffSchema,
  signAuditReport,
  transitionGapReportSchema,
} from '../src/app/core/domain';
import { demoAuditSetup, demoTenantId } from '../src/app/features/dashboard/phase-one-demo';
import { demoAuditId } from '../src/app/features/dashboard/phase-two-demo';
import { demoAuditeeId } from '../src/app/features/dashboard/phase-three-demo';
import {
  demoCapaReminders,
  demoCorrectiveActions,
  demoReportDraft,
  demoReportSignoff,
  demoSignedReport,
  demoTransitionGapReport,
} from '../src/app/features/dashboard/phase-four-demo';

describe('phase 4 reports and CAPA', () => {
  it('creates a tenant-scoped draft report from audit records', () => {
    const report = createDraftAuditReport(
      {
        tenantId: demoTenantId,
        auditId: demoAuditId,
        auditeeId: demoAuditeeId,
        criteria: demoAuditSetup.criteria,
        generatedBy: demoAuditSetup.leadAuditor,
        findingRefs: ['finding-draft-1'],
        evidenceRefs: ['evidence-note-1'],
        capaRefs: ['capa-transition-planning'],
        transitionGapRefs: ['transition-gap-1'],
      },
      'report-test',
      '2026-06-17T21:00:00.000Z',
    );

    assert.equal(report.status, 'draft');
    assert.equal(report.tenantId, demoTenantId);
    assert.equal(report.sections.length, 1);
  });

  it('requires signed reports to include signer, timestamp, and PDF storage ref', () => {
    const result = auditReportSchema.safeParse({
      ...demoReportDraft,
      status: 'signed',
    });

    assert.equal(result.success, false);
  });

  it('signs a report with lead-auditor attribution', () => {
    const signoff = leadAuditorSignoffSchema.parse(demoReportSignoff);
    const signed = signAuditReport(demoReportDraft, signoff);

    assert.equal(signed.status, 'signed');
    assert.equal(signed.signedBy, demoAuditSetup.leadAuditor);
    assert.equal(signed.pdfStorageRef, signoff.pdfStorageRef);
  });

  it('validates demo signed report, CAPA, reminders, and transition gap report', () => {
    assert.equal(auditReportSchema.parse(demoSignedReport).status, 'signed');
    assert.equal(demoCorrectiveActions.map((item) => correctiveActionSchema.parse(item)).length, 2);
    assert.equal(demoCapaReminders.map((item) => capaReminderSchema.parse(item)).length, 2);
    assert.equal(transitionGapReportSchema.parse(demoTransitionGapReport).status, 'draft');
  });

  it('detects overdue CAPA records that are not verified', () => {
    assert.equal(isCapaOverdue(demoCorrectiveActions[0]!, '2026-07-20T00:00:00.000Z'), true);
    assert.equal(
      isCapaOverdue(
        {
          ...demoCorrectiveActions[0]!,
          status: 'verified',
        },
        '2026-07-20T00:00:00.000Z',
      ),
      false,
    );
  });
});
