import {
  AccessibilityCheck,
  HardeningControl,
  ObservabilityEvent,
  PilotChecklistItem,
  SecurityProbe,
} from '../../core/domain';
import { demoAuditId } from './phase-two-demo';
import { demoTenantId } from './phase-one-demo';

export const demoHardeningControls: HardeningControl[] = [
  {
    id: 'control-tenant-rules',
    area: 'tenantIsolation',
    title: 'Cross-tenant reads fail in Firestore emulator probes',
    owner: 'platform-security',
    status: 'planned',
    evidenceRefs: ['firestore.rules'],
    updatedAt: '2026-06-18T16:00:00.000Z',
  },
  {
    id: 'control-storage-rules',
    area: 'securityRules',
    title: 'Storage rules restrict photo and report paths by tenant and audit',
    owner: 'platform-security',
    status: 'passing',
    evidenceRefs: ['storage.rules'],
    updatedAt: '2026-06-18T16:10:00.000Z',
  },
  {
    id: 'control-offline-replay',
    area: 'offlineSync',
    title: 'Offline sync replay preserves createdBy attribution',
    owner: 'field-experience',
    status: 'inProgress',
    evidenceRefs: ['docs/offline-sync.md'],
    updatedAt: '2026-06-18T16:20:00.000Z',
  },
  {
    id: 'control-wcag-core',
    area: 'accessibility',
    title: 'Core audit flows pass WCAG 2.1 AA checks',
    owner: 'product-quality',
    status: 'planned',
    evidenceRefs: [],
    updatedAt: '2026-06-18T16:30:00.000Z',
  },
  {
    id: 'control-observability',
    area: 'observability',
    title: 'Audit-critical events have structured telemetry names',
    owner: 'platform-ops',
    status: 'passing',
    evidenceRefs: ['src/app/core/domain/hardening.ts'],
    updatedAt: '2026-06-18T16:40:00.000Z',
  },
  {
    id: 'control-deploy',
    area: 'deployment',
    title: 'CI verifies typecheck, tests, audit, and production build',
    owner: 'platform-ops',
    status: 'passing',
    evidenceRefs: ['.github/workflows/ci.yml'],
    updatedAt: '2026-06-18T16:50:00.000Z',
  },
];

export const demoSecurityProbes: SecurityProbe[] = [
  {
    id: 'probe-cross-tenant-audit-read',
    tenantId: demoTenantId,
    actorUid: 'uid-omar-auditor',
    attemptedPath: '/tenants/tenant-other/audits/audit-foreign',
    expectedDecision: 'deny',
    actualDecision: 'deny',
    status: 'passed',
  },
  {
    id: 'probe-unassigned-evidence-write',
    tenantId: demoTenantId,
    actorUid: 'uid-not-assigned',
    attemptedPath: `/tenants/${demoTenantId}/audits/${demoAuditId}/evidence/evidence-x`,
    expectedDecision: 'deny',
    status: 'queued',
  },
];

export const demoAccessibilityChecks: AccessibilityCheck[] = [
  {
    id: 'a11y-keyboard-field-note',
    flow: 'Field evidence capture',
    criterion: 'Keyboard access and visible focus',
    status: 'planned',
    notes: 'Run browser accessibility pass after real forms are wired.',
  },
  {
    id: 'a11y-color-soteria',
    flow: 'Dashboard phase console',
    criterion: 'Text and controls meet contrast targets',
    status: 'passing',
    notes: 'Soteria palette uses dark teal and deep blue text on light surfaces.',
  },
];

export const demoObservabilityEvents: ObservabilityEvent[] = [
  {
    id: 'event-report-signed',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    eventType: 'report.signed',
    severity: 'info',
    occurredAt: '2026-06-17T22:30:00.000Z',
    actorUid: 'uid-maya-lead',
    metadata: {
      reportId: 'report-transition-1',
    },
  },
  {
    id: 'event-sync-conflict',
    tenantId: demoTenantId,
    auditId: demoAuditId,
    eventType: 'audit.offlineSyncConflict',
    severity: 'warning',
    occurredAt: '2026-06-15T19:02:00.000Z',
    actorUid: 'uid-omar-auditor',
    metadata: {
      conflictId: 'conflict-checklist-6',
    },
  },
];

export const demoPilotChecklist: PilotChecklistItem[] = [
  {
    id: 'pilot-security-rules',
    title: 'Tenant isolation emulator suite passes',
    area: 'securityRules',
    requiredForPilot: true,
    status: 'planned',
    exitCriteria: 'All cross-tenant read/write probes fail as expected.',
  },
  {
    id: 'pilot-offline-audit',
    title: 'Offline field execution rehearsal completed',
    area: 'offlineSync',
    requiredForPilot: true,
    status: 'inProgress',
    exitCriteria: 'Two auditors capture notes and photos offline, then sync without attribution loss.',
  },
  {
    id: 'pilot-a11y',
    title: 'Core auditor flow accessibility pass completed',
    area: 'accessibility',
    requiredForPilot: true,
    status: 'planned',
    exitCriteria: 'Keyboard, focus, contrast, labels, and error states pass WCAG 2.1 AA review.',
  },
  {
    id: 'pilot-friendly-firm',
    title: 'Friendly-firm pilot package approved',
    area: 'pilotReadiness',
    requiredForPilot: true,
    status: 'planned',
    exitCriteria: 'Pilot tenant, training manual, checklist, support path, and rollback plan are approved.',
  },
];
