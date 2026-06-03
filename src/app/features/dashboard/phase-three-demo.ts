import {
  AiFindingDraft,
  EmsKnowledgeBaseDoc,
  EmsQuestionAnswer,
  LineOfInquiryPrompt,
  RagRetrievalResult,
  TransitionGapCandidate,
} from '../../core/domain';
import { PhotoAiAnalysis } from '../../core/domain/photo-evidence';
import { demoAuditId } from './phase-two-demo';
import { demoTenantId } from './phase-one-demo';

export const demoAuditeeId = 'auditee-northstar';

export const demoKnowledgeDocs: EmsKnowledgeBaseDoc[] = [
  {
    id: 'ems-doc-aspects',
    tenantId: demoTenantId,
    auditeeId: demoAuditeeId,
    title: 'Hazard identification and risk register',
    storageRef: `tenants/${demoTenantId}/auditees/${demoAuditeeId}/ohs/hazard-register.pdf`,
    status: 'embedded',
    embeddingNamespace: `${demoTenantId}:${demoAuditeeId}:ohs`,
    chunkCount: 42,
    uploadedBy: 'uid-maya-lead',
    uploadedAt: '2026-06-10T17:30:00.000Z',
    updatedAt: '2026-06-10T17:45:00.000Z',
  },
  {
    id: 'ems-doc-objectives',
    tenantId: demoTenantId,
    auditeeId: demoAuditeeId,
    title: 'OH&S objectives tracker',
    storageRef: `tenants/${demoTenantId}/auditees/${demoAuditeeId}/ohs/objectives-tracker.xlsx`,
    status: 'embedded',
    embeddingNamespace: `${demoTenantId}:${demoAuditeeId}:ohs`,
    chunkCount: 18,
    uploadedBy: 'uid-omar-auditor',
    uploadedAt: '2026-06-10T18:10:00.000Z',
    updatedAt: '2026-06-10T18:18:00.000Z',
  },
];

export const demoRagResult: RagRetrievalResult = {
  tenantId: demoTenantId,
  auditeeId: demoAuditeeId,
  query: 'What records support transition readiness for planning controls?',
  citations: [
    {
      tenantId: demoTenantId,
      auditeeId: demoAuditeeId,
      docId: 'ems-doc-objectives',
      chunkId: 'chunk-7',
      sourceTitle: 'OH&S objectives tracker',
      storageRef: `tenants/${demoTenantId}/auditees/${demoAuditeeId}/ohs/objectives-tracker.xlsx`,
      relevanceScore: 0.91,
    },
    {
      tenantId: demoTenantId,
      auditeeId: demoAuditeeId,
      docId: 'ems-doc-aspects',
      chunkId: 'chunk-12',
      sourceTitle: 'Hazard identification and risk register',
      storageRef: `tenants/${demoTenantId}/auditees/${demoAuditeeId}/ohs/hazard-register.pdf`,
      relevanceScore: 0.84,
    },
  ],
  generatedAt: '2026-06-15T19:15:00.000Z',
};

export const demoEmsAnswer: EmsQuestionAnswer = {
  id: 'ems-answer-1',
  tenantId: demoTenantId,
  auditeeId: demoAuditeeId,
  requestedBy: 'uid-maya-lead',
  requestedAt: '2026-06-15T19:15:00.000Z',
  provider: 'vertexGemini',
  model: 'gemini-copilot-placeholder',
  question: demoRagResult.query,
  answer:
    'The uploaded tracker and hazard register indicate the audit team should sample objective updates, responsible owners, and the linked hazard/risk records before confirming transition readiness.',
  citations: demoRagResult.citations,
  status: 'needsAuditorReview',
};

export const demoAiFindingDraft: AiFindingDraft = {
  id: 'ai-finding-draft-1',
  tenantId: demoTenantId,
  auditeeId: demoAuditeeId,
  auditId: demoAuditId,
  requestedBy: 'uid-omar-auditor',
  requestedAt: '2026-06-15T19:20:00.000Z',
  provider: 'vertexGemini',
  model: 'gemini-copilot-placeholder',
  promptHash: 'phase3-prompt-hash-1',
  sourceEvidenceRefs: ['evidence-note-1'],
  observation: 'Transition planning evidence is partially available and needs follow-up.',
  draftStatement:
    'Evidence reviewed during fieldwork indicates transition planning records are partially complete; the audit team should verify objective updates and ownership before report signoff.',
  clauseSuggestions: [
    {
      clauseRef: {
        standard: 'ISO_45001',
        edition: 'ISO_45001_2026',
        clauseId: '6',
        title: 'Planning',
      },
      confidence: 0.86,
      rationale: 'The observation concerns planning records, objectives, and transition readiness.',
    },
  ],
  severitySuggestion: {
    suggestedType: 'ofi',
    suggestedSeverity: 'opportunity',
    confidence: 0.78,
    rationale: 'Available evidence suggests a follow-up opportunity rather than a confirmed nonconformity.',
  },
  citations: demoRagResult.citations,
  status: 'needsAuditorReview',
};

export const demoLineOfInquiry: LineOfInquiryPrompt[] = [
  {
    id: 'loi-1',
    tenantId: demoTenantId,
    auditeeId: demoAuditeeId,
    auditId: demoAuditId,
    clauseRef: {
      standard: 'ISO_45001',
      edition: 'ISO_45001_2026',
      clauseId: '6',
      title: 'Planning',
    },
    prompt: 'Ask the process owner to show how current OH&S objectives link to the latest hazard/risk review.',
    rationale: 'The retrieved tracker and hazard register should connect planning records to field controls.',
    citations: demoRagResult.citations,
    status: 'needsAuditorReview',
  },
];

export const demoTransitionGap: TransitionGapCandidate = {
  id: 'transition-gap-1',
  tenantId: demoTenantId,
  auditeeId: demoAuditeeId,
  fromEdition: 'ISO_45001_2018',
  toEdition: 'ISO_45001_2026',
  clauseRef: {
    standard: 'ISO_45001',
    edition: 'ISO_45001_2026',
    clauseId: '6',
    title: 'Planning',
  },
  summary: 'Planning records should be checked for transition readiness and current ownership evidence.',
  evidenceNeeded: ['Current objective tracker', 'Hazard/risk review record', 'Owner interview notes'],
  citations: demoRagResult.citations,
  status: 'needsAuditorReview',
};

export const demoPhotoAiAnalysis: PhotoAiAnalysis = {
  id: 'photo-analysis-1',
  tenantId: demoTenantId,
  auditeeId: demoAuditeeId,
  auditId: demoAuditId,
  evidenceId: 'evidence-photo-1',
  storageRef: `tenants/${demoTenantId}/audits/${demoAuditId}/evidence/photos/ppe-signage.webp`,
  imageHash: 'c'.repeat(64),
  status: 'needsAuditorReview',
  requestedBy: 'uid-ava-auditor',
  requestedAt: '2026-06-15T20:05:00.000Z',
  provider: 'vertexGemini',
  model: 'gemini-vision-placeholder',
  promptHash: 'phase3-photo-prompt-hash-1',
  generatedAt: '2026-06-15T20:06:00.000Z',
  observations: [
    {
      label: 'Mandatory PPE signage at cell entry',
      confidence: 0.82,
      signal: 'labelOrSignage',
      rationale: 'The image appears to show safety signage that should be verified in field context.',
    },
  ],
  detectedText: ['PPE required'],
  findingCandidates: [
    {
      summary: 'Verify PPE signage placement and that controls match the risk assessment.',
      suggestedType: 'ofi',
      suggestedSeverity: 'opportunity',
      clauseSuggestions: [
        {
          clauseRef: {
            standard: 'ISO_45001',
            edition: 'ISO_45001_2026',
            clauseId: '8',
            title: 'Operation',
          },
          rationale: 'The photo appears related to operational control evidence.',
        },
      ],
      evidenceRationale: 'Photo signal can help focus a follow-up field question.',
    },
  ],
};
