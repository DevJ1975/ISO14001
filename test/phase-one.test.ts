import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auditSetupCommandSchema,
  checklistTemplateSchema,
  createPlannedAuditFromSetup,
} from '../src/app/core/domain';
import {
  auditeePath,
  auditChecklistItemPath,
  auditPath,
  checklistTemplatePath,
} from '../src/app/core/firebase/firestore-paths';
import {
  demoAuditSetup,
  demoAuditees,
  demoChecklistTemplate,
  demoMembers,
  demoTenantId,
} from '../src/app/features/dashboard/phase-one-demo';

describe('phase 1 planning contracts', () => {
  it('parses the demo checklist template with original or licensed question sources', () => {
    const template = checklistTemplateSchema.parse(demoChecklistTemplate);

    assert.equal(template.tenantId, demoTenantId);
    assert.equal(template.items.length, 3);
    assert.equal(template.items.every((item) => item.source !== 'licensedContent'), true);
  });

  it('requires the lead auditor to be assigned to the audit', () => {
    const result = auditSetupCommandSchema.safeParse({
      ...demoAuditSetup,
      assignedMembers: ['uid-omar-auditor'],
    });

    assert.equal(result.success, false);
  });

  it('requires checklist section owners to be assigned audit members', () => {
    const result = auditSetupCommandSchema.safeParse({
      ...demoAuditSetup,
      sectionOwners: {
        ...demoAuditSetup.sectionOwners,
        '9': 'uid-not-on-team',
      },
    });

    assert.equal(result.success, false);
  });

  it('creates a planned audit from a valid setup command', () => {
    const command = auditSetupCommandSchema.parse(demoAuditSetup);
    const audit = createPlannedAuditFromSetup(command, 'audit-transition-1', '2026-05-29T12:00:00.000Z');

    assert.equal(audit.status, 'planned');
    assert.equal(audit.tenantId, demoTenantId);
    assert.equal(audit.assignedMembers.includes(audit.leadAuditor), true);
  });

  it('keeps auditees and team members in the same tenant', () => {
    assert.equal(demoAuditees.every((auditee) => auditee.tenantId === demoTenantId), true);
    assert.equal(demoMembers.every((member) => member.tenantId === demoTenantId), true);
  });

  it('builds tenant-scoped Firestore paths for Phase 1 records', () => {
    assert.equal(auditeePath(demoTenantId, 'auditee-northstar'), '/tenants/tenant-greenline/auditees/auditee-northstar');
    assert.equal(
      checklistTemplatePath(demoTenantId, 'template-transition-readiness'),
      '/tenants/tenant-greenline/checklistTemplates/template-transition-readiness',
    );
    assert.equal(auditPath(demoTenantId, 'audit-1'), '/tenants/tenant-greenline/audits/audit-1');
    assert.equal(
      auditChecklistItemPath(demoTenantId, 'audit-1', 'item-4'),
      '/tenants/tenant-greenline/audits/audit-1/checklistItems/item-4',
    );
  });
});
