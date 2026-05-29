import { AuditSetupCommand, Auditee, ChecklistTemplate, Member } from '../../core/domain';

export const demoTenantId = 'tenant-greenline';

export const demoMembers: Member[] = [
  {
    uid: 'uid-maya-lead',
    tenantId: demoTenantId,
    role: 'leadAuditor',
    profile: {
      displayName: 'Maya Chen',
      email: 'maya.chen@example-audit.test',
    },
    status: 'active',
    auditeeScope: [],
    createdAt: '2026-05-29T12:00:00.000Z',
  },
  {
    uid: 'uid-omar-auditor',
    tenantId: demoTenantId,
    role: 'auditor',
    profile: {
      displayName: 'Omar Patel',
      email: 'omar.patel@example-audit.test',
    },
    status: 'active',
    auditeeScope: [],
    createdAt: '2026-05-29T12:00:00.000Z',
  },
  {
    uid: 'uid-ava-auditor',
    tenantId: demoTenantId,
    role: 'auditor',
    profile: {
      displayName: 'Ava Brooks',
      email: 'ava.brooks@example-audit.test',
    },
    status: 'active',
    auditeeScope: [],
    createdAt: '2026-05-29T12:00:00.000Z',
  },
];

export const demoAuditees: Auditee[] = [
  {
    id: 'auditee-northstar',
    tenantId: demoTenantId,
    name: 'Northstar Components',
    sites: [
      {
        id: 'site-denver',
        name: 'Denver Assembly Plant',
        address: '1400 Foundry Road, Denver, CO',
      },
      {
        id: 'site-lakewood',
        name: 'Lakewood Warehouse',
        address: '2300 Distribution Way, Lakewood, CO',
      },
    ],
    contacts: [
      {
        name: 'Elena Ruiz',
        email: 'elena.ruiz@northstar.example',
        role: 'EHS Manager',
      },
    ],
    status: 'active',
  },
  {
    id: 'auditee-riverbend',
    tenantId: demoTenantId,
    name: 'Riverbend Packaging',
    sites: [
      {
        id: 'site-boise',
        name: 'Boise Converting Site',
        address: '815 Mill Loop, Boise, ID',
      },
    ],
    contacts: [
      {
        name: 'Jon Bell',
        email: 'jon.bell@riverbend.example',
        role: 'Operations Director',
      },
    ],
    status: 'active',
  },
];

export const demoChecklistTemplate: ChecklistTemplate = {
  id: 'template-transition-readiness',
  tenantId: demoTenantId,
  name: 'ISO 14001 transition readiness',
  description: 'Original tenant checklist prompts for transition and surveillance audit planning.',
  criteria: 'ISO_14001_2026',
  status: 'active',
  createdBy: 'uid-maya-lead',
  createdAt: '2026-05-29T12:00:00.000Z',
  updatedAt: '2026-05-29T12:00:00.000Z',
  items: [
    {
      id: 'template-item-context',
      tenantId: demoTenantId,
      templateId: 'template-transition-readiness',
      clauseRef: {
        standard: 'ISO_14001',
        edition: 'ISO_14001_2026',
        clauseId: '4',
        title: 'Context of the organization',
      },
      question: 'What internal and external EMS context changes should the team verify during this audit?',
      guidance: 'Use auditee-authored context records, interviews, and site observations.',
      evidencePrompts: [
        { id: 'evidence-context-record', label: 'Current context review record', required: true },
        { id: 'evidence-stakeholder-input', label: 'Relevant stakeholder input', required: false },
      ],
      source: 'trainovateGenerated',
      sortOrder: 10,
      createdBy: 'uid-maya-lead',
      createdAt: '2026-05-29T12:00:00.000Z',
      updatedAt: '2026-05-29T12:00:00.000Z',
    },
    {
      id: 'template-item-planning',
      tenantId: demoTenantId,
      templateId: 'template-transition-readiness',
      clauseRef: {
        standard: 'ISO_14001',
        edition: 'ISO_14001_2026',
        clauseId: '6',
        title: 'Planning',
      },
      question: 'Which planned controls, objectives, and evidence sources should be sampled for transition readiness?',
      guidance: 'Keep the prompt tied to auditee records and avoid copying standard text.',
      evidencePrompts: [
        { id: 'evidence-objectives', label: 'Current environmental objectives', required: true },
        { id: 'evidence-risk-register', label: 'Risk and opportunity planning record', required: true },
      ],
      source: 'trainovateGenerated',
      sortOrder: 20,
      createdBy: 'uid-maya-lead',
      createdAt: '2026-05-29T12:00:00.000Z',
      updatedAt: '2026-05-29T12:00:00.000Z',
    },
    {
      id: 'template-item-operation',
      tenantId: demoTenantId,
      templateId: 'template-transition-readiness',
      clauseRef: {
        standard: 'ISO_14001',
        edition: 'ISO_14001_2026',
        clauseId: '8',
        title: 'Operation',
      },
      question: 'Which operational controls should be observed, photographed, or sampled during fieldwork?',
      guidance: 'Use photo evidence only where site rules allow it.',
      evidencePrompts: [
        { id: 'evidence-operational-control', label: 'Observed operational control evidence', required: true },
        { id: 'evidence-photo', label: 'Photo evidence when permitted', required: false },
      ],
      source: 'customerAuthored',
      sortOrder: 30,
      createdBy: 'uid-maya-lead',
      createdAt: '2026-05-29T12:00:00.000Z',
      updatedAt: '2026-05-29T12:00:00.000Z',
    },
  ],
};

export const demoAuditSetup: AuditSetupCommand = {
  tenantId: demoTenantId,
  auditeeId: 'auditee-northstar',
  templateId: 'template-transition-readiness',
  criteria: 'ISO_14001_2026',
  scope: 'Denver Assembly Plant environmental management system transition readiness audit.',
  objectives: [
    'Verify transition readiness for the selected EMS scope.',
    'Confirm field evidence can be captured offline by assigned auditors.',
  ],
  assignedMembers: ['uid-maya-lead', 'uid-omar-auditor', 'uid-ava-auditor'],
  leadAuditor: 'uid-maya-lead',
  sectionOwners: {
    '4': 'uid-maya-lead',
    '6': 'uid-omar-auditor',
    '8': 'uid-ava-auditor',
  },
  dates: {
    startsAt: '2026-06-15T15:00:00.000Z',
    endsAt: '2026-06-17T23:00:00.000Z',
  },
};
