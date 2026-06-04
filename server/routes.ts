import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

import { Db } from 'mongodb';
import { z, ZodError, ZodType } from 'zod';

import {
  addTenantUserCommandSchema,
  backendJobSchema,
  buildEvidenceMetadataPath,
  buildPhotoEvidenceStorageRef,
  capaReminderScheduleCommandSchema,
  evidenceRequestSchema,
  evidenceUploadIntentCommandSchema,
  evidenceUploadIntentSchema,
  memberClaimsAssignmentCommandSchema,
  memberStatusUpdateCommandSchema,
  photoAnalysisRequestCommandSchema,
  provisionClientCommandSchema,
  reportPdfGenerationCommandSchema,
  setPasswordCommandSchema,
  superadminLoginCommandSchema,
  tenantMemberInviteCommandSchema,
  tenantOnboardingCommandSchema,
} from '../src/app/core/domain/index.js';
import {
  ApiAuthError,
  authenticateRequest,
  issueMemberToken,
  issuePlatformToken,
  requireAnyRole,
  requireSuperadmin,
  requireTenant,
} from './auth.js';
import { mongoCollections } from './collections.js';
import { ServerConfig } from './config.js';
import { LoggingMailer, Mailer, setPasswordEmail } from './mailer.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  SetPasswordTokenError,
  consumeSetPasswordToken,
  describeSetPasswordToken,
  issueSetPasswordToken,
  revokeSetPasswordTokens,
} from './set-password.js';

export interface RouteDependencies {
  readonly db: Db;
  readonly config: ServerConfig;
  /** Optional; defaults to the logging mailer so callers (and tests) needn't wire one. */
  readonly mailer?: Mailer;
}

/** Fallback mailer when a caller doesn't provide one (logs the message). */
const defaultMailer = new LoggingMailer();

type RouteParams = Record<string, string>;

interface RouteMatch {
  readonly params: RouteParams;
  readonly pattern: RegExp;
}

const jsonContentType = { 'content-type': 'application/json; charset=utf-8' };

// In-memory login throttle: after MAX_ATTEMPTS failures for a key within
// WINDOW_MS, further attempts are refused until the window elapses. Good enough
// for a single-process dev/reference server; a multi-instance deployment should
// back this with a shared store (Redis) or an edge rate limiter.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();

function loginRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) return false;
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

const tenantPath = '([^/]+)';
const auditPath = '([^/]+)';
const reportPath = '([^/]+)';
const capaPath = '([^/]+)';

function matchPath(pattern: RegExp, pathname: string, names: string[]): RouteMatch | null {
  const match = pathname.match(pattern);
  if (!match) {
    return null;
  }

  return {
    pattern,
    params: names.reduce<RouteParams>((params, name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? '');
      return params;
    }, {}),
  };
}

async function readJson<T>(request: IncomingMessage, schema: ZodType<T>): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return schema.parse(rawBody ? JSON.parse(rawBody) : {});
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown, corsOrigin: string): void {
  response.writeHead(statusCode, {
    ...jsonContentType,
    'access-control-allow-origin': corsOrigin,
    'access-control-allow-headers': 'authorization,content-type,x-iso-actor-uid,x-iso-platform,x-iso-role,x-iso-tenant-id',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown, corsOrigin: string): void {
  if (error instanceof ApiAuthError) {
    sendJson(response, 401, { error: error.message }, corsOrigin);
    return;
  }

  if (error instanceof ApiConflictError) {
    sendJson(response, 409, { error: error.message }, corsOrigin);
    return;
  }

  if (error instanceof SetPasswordTokenError) {
    sendJson(response, 400, { error: error.message }, corsOrigin);
    return;
  }

  if (error instanceof ZodError) {
    sendJson(response, 400, { error: 'Invalid request body.', issues: error.issues }, corsOrigin);
    return;
  }

  sendJson(response, 500, { error: 'Unexpected backend error.' }, corsOrigin);
}

/** A request that conflicts with existing state (e.g. an email already in use). */
class ApiConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConflictError';
  }
}

/** Safe member projection for API responses — never leaks the password hash. */
function toMemberView(doc: Record<string, unknown>): {
  uid: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt?: string;
} {
  const profile = (doc['profile'] as { email?: string; displayName?: string } | undefined) ?? {};
  return {
    uid: String(doc['uid'] ?? ''),
    tenantId: (doc['tenantId'] as string | null) ?? null,
    email: profile.email ?? '',
    displayName: profile.displayName ?? '',
    role: String(doc['role'] ?? ''),
    status: String(doc['status'] ?? 'invited'),
    createdAt: doc['createdAt'] as string | undefined,
  };
}

/**
 * Create an `invited` member (no password yet), mint a single-use set-password
 * token, and email the link. Returns the safe member view and the link (the
 * caller decides whether to expose the link in the response). Throws
 * ApiConflictError if the email is already in use anywhere on the platform.
 */
async function inviteNewMember(
  deps: RouteDependencies,
  input: { tenantId: string; tenantName: string; role: string; email: string; displayName: string; actorUid: string },
): Promise<{ member: ReturnType<typeof toMemberView>; link: string }> {
  const email = input.email.toLowerCase().trim();
  const existing = await deps.db.collection(mongoCollections.members).findOne({ 'profile.email': email });
  if (existing) {
    throw new ApiConflictError('A user with that email already exists.');
  }
  const now = new Date().toISOString();
  const member = {
    uid: `uid-${randomUUID()}`,
    tenantId: input.tenantId,
    role: input.role,
    status: 'invited' as const,
    profile: { email, displayName: input.displayName.trim() || email.split('@')[0] },
    createdAt: now,
  };
  await deps.db.collection(mongoCollections.members).insertOne({ ...member });
  const { link } = await issueSetPasswordToken(
    deps.db,
    { uid: member.uid, tenantId: input.tenantId, email, purpose: 'invite' },
    deps.config,
  );
  await (deps.mailer ?? defaultMailer).send(
    setPasswordEmail({ to: email, displayName: member.profile.displayName, tenantName: input.tenantName, link, purpose: 'invite' }),
  );
  await recordChange(deps.db, {
    tenantId: input.tenantId,
    actorUid: input.actorUid,
    action: 'member.invite',
    target: 'member',
    targetId: member.uid,
  });
  return { member: toMemberView(member), link };
}

/**
 * Append an immutable change-log entry — the audit trail an audit tool needs
 * (who changed what, when). Best-effort: logging failure must never block the
 * underlying write, so callers don't await rejection paths.
 */
async function recordChange(
  db: Db,
  entry: { tenantId: string; auditId?: string; actorUid: string; action: string; target: string; targetId?: string },
): Promise<void> {
  try {
    await db.collection(mongoCollections.changeLog).insertOne({
      id: `chg-${randomUUID()}`,
      ...entry,
      at: new Date().toISOString(),
    });
  } catch {
    // Never let audit logging break the request it is recording.
  }
}

function createBackendJob(input: {
  tenantId: string;
  auditId?: string;
  callableName: z.infer<typeof backendJobSchema>['callableName'];
  requestedByUid: string;
  idempotencyKey: string;
  resultRef?: string;
}): z.infer<typeof backendJobSchema> {
  const now = new Date().toISOString();
  return backendJobSchema.parse({
    id: `job-${randomUUID()}`,
    tenantId: input.tenantId,
    auditId: input.auditId,
    callableName: input.callableName,
    requestedByUid: input.requestedByUid,
    status: 'queued',
    idempotencyKey: input.idempotencyKey,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    resultRef: input.resultRef,
  });
}

const loginCommandSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const fieldResultSchema = z.enum(['notStarted', 'conform', 'minorNc', 'majorNc', 'ofi', 'na']);

const checklistResultCommandSchema = z.object({
  result: fieldResultSchema,
  note: z.string().max(4000).optional(),
});

const evidenceCreateCommandSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['photo', 'note']),
  itemId: z.string().min(1).optional(),
  clauseId: z.string().min(1).optional(),
  label: z.string().min(1).max(4000),
  capturedByName: z.string().min(1),
  capturedAt: z.string().min(1),
  geo: z.object({ lat: z.number(), lng: z.number(), accuracyMeters: z.number().optional() }).optional(),
});

const findingCreateCommandSchema = z.object({
  id: z.string().min(1),
  clauseId: z.string().min(1),
  clauseTitle: z.string().min(1),
  type: z.enum(['minorNc', 'majorNc', 'ofi', 'conformity']),
  description: z.string().min(1).max(8000),
  evidenceIds: z.array(z.string().min(1)).default([]),
  createdByName: z.string().min(1),
  createdAt: z.string().min(1),
});

const ncStatusServerSchema = z.enum([
  'open',
  'responded',
  'implemented',
  'verified',
  'closed',
  'rejected',
  'reopened',
]);

const findingUpsertCommandSchema = z.object({
  id: z.string().min(1),
  clauseId: z.string().min(1),
  clauseTitle: z.string().min(1),
  type: z.enum(['minorNc', 'majorNc', 'ofi', 'conformity']),
  description: z.string().min(1).max(8000),
  requirementSummary: z.string().max(1000).optional(),
  objectiveEvidence: z.string().max(8000).optional(),
  gradingRationale: z.string().max(4000).optional(),
  systemic: z.boolean().optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
  status: ncStatusServerSchema.default('open'),
  createdByName: z.string().min(1),
  createdAt: z.string().min(1),
  // Auditee portal response (acknowledgement + proposed correction).
  acknowledgedAt: z.string().max(40).optional(),
  responseText: z.string().max(8000).optional(),
});

const capaStatusServerSchema = z.enum(['open', 'inProgress', 'verificationDue', 'verified', 'overdue']);

const capaUpsertCommandSchema = z.object({
  id: z.string().min(1),
  findingId: z.string().min(1),
  // ISO 45001 cl. 10.2: action intent + root-cause method driving the action.
  intent: z.enum(['correction', 'correctiveAction', 'preventiveAction']).default('correctiveAction'),
  correction: z.string().max(4000).optional(),
  rootCauseMethod: z.enum(['fiveWhys', 'fishbone', 'faultTree', 'other']).optional(),
  rootCause: z.string().max(4000).optional(),
  action: z.string().max(4000).optional(),
  owner: z.string().max(300).optional(),
  dueDate: z.string().optional(),
  implementationEvidenceIds: z.array(z.string().min(1)).default([]),
  verification: z.string().max(4000).optional(),
  verificationEvidenceIds: z.array(z.string().min(1)).default([]),
  status: capaStatusServerSchema.default('open'),
  verifiedByName: z.string().optional(),
  verifiedAt: z.string().optional(),
  createdAt: z.string().min(1),
});

const capaVerifyCommandSchema = z.object({
  findingId: z.string().min(1),
  verification: z.string().min(1).max(4000),
  effective: z.boolean(),
  verificationEvidenceIds: z.array(z.string().min(1)).default([]),
});

const auditStatusCommandSchema = z.object({
  status: z.enum(['draft', 'planned', 'fieldwork', 'reporting', 'followUp', 'closed', 'archived']),
});

const meetingUpsertCommandSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['opening', 'closing']),
  datetimeAt: z.string().min(1),
  attendees: z.array(z.string()).default([]),
  agendaPoints: z.array(z.string()).default([]),
  notes: z.string().max(8000).optional(),
  acknowledged: z.boolean().default(false),
});

const conclusionCommandSchema = z.object({
  overallConformity: z.string().max(8000).default(''),
  emsEffectivenessOpinion: z.string().max(8000).optional(),
  criteriaMetStatement: z.string().max(4000).optional(),
  divergingOpinions: z.string().max(4000).optional(),
  recommendation: z.enum(['recommend', 'conditional', 'notRecommended', 'satisfactory', 'actionRequired']),
  updatedAt: z.string().optional(),
});

const signoffCommandSchema = z.object({
  attestation: z.string().min(20).max(1000),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/, 'contentHash must be a 64-char hex SHA-256').optional(),
});

const reportMetaCommandSchema = z.object({
  auditType: z.enum(['internal', 'stage1', 'stage2', 'surveillance', 'recertification']).default('stage2'),
  scope: z.string().max(4000).default(''),
  objectives: z.string().max(4000).default(''),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  sites: z.string().max(2000).default(''),
  auditTrail: z.string().max(8000).default(''),
  leadAuditorName: z.string().max(300).default(''),
  auditorCompetence: z.string().max(1000).default(''),
  impartialityDeclared: z.boolean().default(false),
  distribution: z.string().max(1000).default(''),
  reportVersion: z.number().int().positive().default(1),
});

const registerResultSchema = z.enum(['notStarted', 'conforming', 'nonconforming', 'notApplicable', 'needsFollowUp']);

const aspectUpsertCommandSchema = z.object({
  id: z.string().min(1),
  aspect: z.string().max(300).default(''),
  activity: z.string().max(300).default(''),
  impact: z.string().max(300).default(''),
  significance: z.enum(['low', 'medium', 'high']).default('medium'),
  severityScore: z.number().int().min(1).max(5).optional(),
  likelihoodScore: z.number().int().min(1).max(5).optional(),
  legalConcern: z.boolean().optional(),
  stakeholderConcern: z.boolean().optional(),
  significanceRationale: z.string().max(1000).optional(),
  controlType: z.enum(['elimination', 'substitution', 'engineering', 'administrative', 'ppe']).optional(),
  controls: z.string().max(2000).optional(),
  relatedClauseId: z.string().optional(),
  result: registerResultSchema.default('notStarted'),
});

/** One timestamped compliance evaluation in an obligation's history (cl. 9.1.2). */
const complianceEvaluationSchema = z.object({
  id: z.string().min(1),
  evaluatedAt: z.string(),
  complianceStatus: z.enum(['compliant', 'nonCompliant', 'toVerify']),
  evaluatedBy: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
});

const obligationUpsertCommandSchema = z.object({
  id: z.string().min(1),
  obligation: z.string().max(300).default(''),
  source: z.enum(['legal', 'other']).default('legal'),
  requirement: z.string().max(2000).default(''),
  complianceStatus: z.enum(['compliant', 'nonCompliant', 'toVerify']).default('toVerify'),
  lastEvaluatedAt: z.string().optional(),
  evaluations: z.array(complianceEvaluationSchema).max(200).default([]),
  result: registerResultSchema.default('notStarted'),
});

const emergencyUpsertCommandSchema = z.object({
  id: z.string().min(1),
  scenario: z.string().max(300).default(''),
  procedureRef: z.string().max(300).optional(),
  lastDrillAt: z.string().optional(),
  notes: z.string().max(2000).optional(),
  result: registerResultSchema.default('notStarted'),
});

const interestedPartyUpsertCommandSchema = z.object({
  id: z.string().min(1),
  party: z.string().max(300).default(''),
  category: z.enum(['internal', 'external']).default('external'),
  needs: z.string().max(2000).optional(),
  howAddressed: z.string().max(2000).optional(),
  result: registerResultSchema.default('notStarted'),
});

const objectiveUpsertCommandSchema = z.object({
  id: z.string().min(1),
  objective: z.string().max(300).default(''),
  target: z.string().max(1000).optional(),
  owner: z.string().max(300).optional(),
  dueDate: z.string().optional(),
  progress: z.enum(['notStarted', 'onTrack', 'atRisk', 'achieved']).default('notStarted'),
  result: registerResultSchema.default('notStarted'),
});

const communicationUpsertCommandSchema = z.object({
  id: z.string().min(1),
  topic: z.string().max(300).default(''),
  direction: z.enum(['internal', 'external', 'both']).default('internal'),
  audience: z.string().max(300).optional(),
  method: z.string().max(300).optional(),
  frequency: z.string().max(120).optional(),
  result: registerResultSchema.default('notStarted'),
});

const managementReviewUpsertCommandSchema = z.object({
  id: z.string().min(1),
  reviewDate: z.string().optional(),
  attendees: z.string().max(2000).optional(),
  inputs: z.string().max(4000).optional(),
  decisions: z.string().max(4000).optional(),
  actions: z.string().max(4000).optional(),
  result: registerResultSchema.default('notStarted'),
});

const workerConsultationUpsertCommandSchema = z.object({
  id: z.string().min(1),
  topic: z.string().max(300).default(''),
  category: z
    .enum([
      'policy',
      'hazardIdentification',
      'riskAssessment',
      'controls',
      'incidentInvestigation',
      'training',
      'ppe',
      'emergencyArrangements',
      'changes',
      'other',
    ])
    .default('other'),
  mechanism: z.enum(['safetyCommittee', 'toolboxTalk', 'survey', 'rep', 'directConsultation', 'other']).default('safetyCommittee'),
  workerGroup: z.string().max(300).optional(),
  participationEvidence: z.string().max(2000).optional(),
  outcome: z.string().max(2000).optional(),
  date: z.string().optional(),
  result: registerResultSchema.default('notStarted'),
});

const riskOpportunityUpsertCommandSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(500).default(''),
  kind: z.enum(['risk', 'opportunity']).default('risk'),
  significance: z.enum(['low', 'medium', 'high']).default('medium'),
  treatment: z.string().max(2000).optional(),
  result: registerResultSchema.default('notStarted'),
});

const resourceUpsertCommandSchema = z.object({
  id: z.string().min(1),
  resource: z.string().max(300).default(''),
  category: z.enum(['people', 'infrastructure', 'financial', 'technology']).default('people'),
  adequacy: z.enum(['adequate', 'partial', 'inadequate']).default('adequate'),
  notes: z.string().max(2000).optional(),
  result: registerResultSchema.default('notStarted'),
});

const competenceUpsertCommandSchema = z.object({
  id: z.string().min(1),
  role: z.string().max(300).default(''),
  requiredCompetence: z.string().max(2000).optional(),
  trainingEvidence: z.string().max(2000).optional(),
  status: z.enum(['competent', 'inTraining', 'gap']).default('competent'),
  result: registerResultSchema.default('notStarted'),
});

const workerUpsertCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(300).default(''),
  role: z.string().max(300).default(''),
  employeeRef: z.string().max(120).optional(),
  competenceSummary: z.string().max(2000).optional(),
  active: z.boolean().default(true),
});

const siteUpsertCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(300).default(''),
  address: z.string().max(500).optional(),
  activities: z.string().max(2000).optional(),
  siteRef: z.string().max(120).optional(),
});

const awarenessUpsertCommandSchema = z.object({
  id: z.string().min(1),
  topic: z.string().max(300).default(''),
  audience: z.string().max(300).optional(),
  method: z.string().max(300).optional(),
  result: registerResultSchema.default('notStarted'),
});

const documentAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(300),
  mime: z.string().max(200).optional(),
  size: z.number().int().min(0).optional(),
  blobKey: z.string().max(200).optional(),
  uploaded: z.boolean().optional(),
  addedAt: z.string().max(40),
});

const documentedInfoUpsertCommandSchema = z.object({
  id: z.string().min(1),
  document: z.string().max(300).default(''),
  docType: z.string().max(120).optional(),
  controlStatus: z.enum(['controlled', 'uncontrolled', 'draft', 'obsolete']).default('controlled'),
  retention: z.string().max(300).optional(),
  version: z.string().max(60).optional(),
  owner: z.string().max(200).optional(),
  lastReviewedAt: z.string().max(40).optional(),
  nextReviewAt: z.string().max(40).optional(),
  reviewFrequencyMonths: z.number().int().min(0).max(120).optional(),
  attachments: z.array(documentAttachmentSchema).max(50).optional(),
  result: registerResultSchema.default('notStarted'),
});

const performanceMetricUpsertCommandSchema = z.object({
  id: z.string().min(1),
  indicator: z.string().max(300).default(''),
  category: z.enum(['lostTimeInjury', 'recordableInjury', 'nearMiss', 'illHealth', 'exposure', 'inspection', 'toolboxTalk', 'trainingCompletion', 'other']).default('lostTimeInjury'),
  unit: z.string().max(40).default(''),
  period: z.string().max(60).default(''),
  baselineValue: z.number().finite().optional(),
  targetValue: z.number().finite().optional(),
  actualValue: z.number().finite().optional(),
  trend: z.enum(['improving', 'stable', 'worsening', 'notEvaluated']).default('notEvaluated'),
  monitoringMethod: z.string().max(500).optional(),
  evaluationNotes: z.string().max(2000).optional(),
  result: registerResultSchema.default('notStarted'),
});

const permitUpsertCommandSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300).default(''),
  permitType: z.enum(['permit', 'licence', 'consent', 'registration', 'exemption']).default('permit'),
  reference: z.string().max(200).optional(),
  issuingAuthority: z.string().max(300).optional(),
  issuedAt: z.string().max(40).optional(),
  expiresAt: z.string().max(40).optional(),
  renewalReminderDays: z.number().int().min(0).max(3650).optional(),
  conditionsSummary: z.string().max(2000).optional(),
  monitoringRequirements: z.string().max(2000).optional(),
  complianceStatus: z.enum(['compliant', 'nonCompliant', 'toVerify']).default('toVerify'),
  result: registerResultSchema.default('notStarted'),
});

const incidentUpsertCommandSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300).default(''),
  occurredAt: z.string().max(40).optional(),
  location: z.string().max(300).optional(),
  incidentType: z
    .enum(['injury', 'illHealth', 'nearMiss', 'dangerousOccurrence', 'propertyDamage', 'fatality', 'other'])
    .default('injury'),
  severity: z.enum(['low', 'medium', 'high']).default('low'),
  description: z.string().max(2000).optional(),
  immediateAction: z.string().max(2000).optional(),
  rootCause: z.string().max(2000).optional(),
  correctiveActionRef: z.string().max(200).optional(),
  injuryClassification: z.enum(['none', 'firstAid', 'medicalTreatment', 'lostTime', 'riddor']).optional(),
  reportableToRegulator: z.boolean().optional(),
  status: z.enum(['open', 'investigating', 'actioned', 'closed']).default('open'),
  result: registerResultSchema.default('notStarted'),
});

const hiraUpsertCommandSchema = z.object({
  id: z.string().min(1),
  activity: z.string().max(300).default(''),
  routineness: z.enum(['routine', 'nonRoutine', 'emergency']).default('routine'),
  hazard: z.string().max(300).default(''),
  whoAtHarm: z.string().max(300).optional(),
  existingControls: z.string().max(2000).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  additionalControls: z.string().max(2000).optional(),
  controlType: z.enum(['elimination', 'substitution', 'engineering', 'administrative', 'ppe']).optional(),
  residualSeverity: z.number().int().min(1).max(5).optional(),
  residualLikelihood: z.number().int().min(1).max(5).optional(),
  relatedClauseId: z.string().max(40).optional(),
  result: registerResultSchema.default('notStarted'),
});

const calibrationUpsertCommandSchema = z.object({
  id: z.string().min(1),
  equipment: z.string().max(300).default(''),
  identifier: z.string().max(120).optional(),
  parameter: z.string().max(200).optional(),
  method: z.string().max(300).optional(),
  lastCalibratedAt: z.string().max(40).optional(),
  nextDueAt: z.string().max(40).optional(),
  frequencyMonths: z.number().int().min(0).max(120).optional(),
  outOfService: z.boolean().optional(),
  result: registerResultSchema.default('notStarted'),
});

const trainingUpsertCommandSchema = z.object({
  id: z.string().min(1),
  person: z.string().max(200).default(''),
  role: z.string().max(200).optional(),
  course: z.string().max(300).default(''),
  completedAt: z.string().max(40).optional(),
  expiresAt: z.string().max(40).optional(),
  frequencyMonths: z.number().int().min(0).max(120).optional(),
  mandatory: z.boolean().optional(),
  result: registerResultSchema.default('notStarted'),
});

const supplierUpsertCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(300).default(''),
  serviceType: z.string().max(200).optional(),
  category: z.enum(['supplier', 'contractor', 'labourProvider', 'outsourcedProcess', 'other']).default('supplier'),
  environmentallyRelevant: z.boolean().optional(),
  controlsCommunicated: z.boolean().optional(),
  rating: z.enum(['notRated', 'approved', 'conditional', 'rejected']).default('notRated'),
  lastEvaluatedAt: z.string().max(40).optional(),
  nextEvaluationAt: z.string().max(40).optional(),
  evaluationFrequencyMonths: z.number().int().min(0).max(120).optional(),
  notes: z.string().max(2000).optional(),
  result: registerResultSchema.default('notStarted'),
});

const changeUpsertCommandSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300).default(''),
  description: z.string().max(2000).optional(),
  changeType: z.enum(['process', 'equipment', 'material', 'organisational', 'regulatory', 'other']).default('process'),
  status: z.enum(['proposed', 'assessing', 'approved', 'implemented', 'closed', 'rejected']).default('proposed'),
  aspectsReviewed: z.boolean().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  owner: z.string().max(200).optional(),
  controls: z.string().max(2000).optional(),
  targetDate: z.string().max(40).optional(),
  implementedAt: z.string().max(40).optional(),
  result: registerResultSchema.default('notStarted'),
});

const operationalControlUpsertCommandSchema = z.object({
  id: z.string().min(1),
  activity: z.string().max(300).default(''),
  controlDescription: z.string().max(2000).optional(),
  controlType: z.enum(['elimination', 'substitution', 'engineering', 'administrative', 'ppe']).default('administrative'),
  procedureRef: z.string().max(200).optional(),
  verified: z.boolean().optional(),
  effectiveness: z.enum(['effective', 'partial', 'ineffective', 'notEvaluated']).default('notEvaluated'),
  relatedClause: z.string().max(40).optional(),
  result: registerResultSchema.default('notStarted'),
});

const programmeUpsertSchema = z.object({
  cycleYear: z.number().int(),
  criteria: z.string().min(1),
  plannedAudits: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.enum(['internal', 'certificationStage1', 'certificationStage2', 'surveillance', 'recertification', 'special']),
        dueDate: z.string(),
        status: z.enum(['planned', 'inProgress', 'completed', 'cancelled']).default('planned'),
      }),
    )
    .default([]),
  competence: z
    .array(
      z.object({
        id: z.string().min(1),
        memberName: z.string().default(''),
        qualifications: z.string().default(''),
        impartialityDeclared: z.boolean().default(false),
      }),
    )
    .default([]),
  certificates: z
    .array(
      z.object({
        id: z.string().min(1),
        certificateNumber: z.string().max(120).default(''),
        auditeeName: z.string().max(300).optional(),
        edition: z.string().max(40).optional(),
        scopeStatement: z.string().max(2000).default(''),
        sites: z.array(z.string().max(300)).default([]),
        issuedAt: z.string().max(40).optional(),
        expiresAt: z.string().max(40).optional(),
        status: z.enum(['active', 'suspended', 'withdrawn', 'expired', 'reducedScope']).default('active'),
        history: z
          .array(
            z.object({
              action: z.string().max(40),
              at: z.string().max(40),
              by: z.string().max(200).optional(),
              reason: z.string().max(1000).optional(),
            }),
          )
          .default([]),
        updatedAt: z.string().max(40).optional(),
      }),
    )
    .default([]),
  complaintsAppeals: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(['complaint', 'appeal']).default('complaint'),
        subject: z.string().max(300).default(''),
        source: z.string().max(300).optional(),
        description: z.string().max(2000).default(''),
        receivedAt: z.string().max(40).optional(),
        dueDate: z.string().max(40).optional(),
        status: z.enum(['received', 'underReview', 'resolved', 'closed', 'upheld', 'rejected']).default('received'),
        handledBy: z.string().max(200).optional(),
        resolution: z.string().max(2000).optional(),
        updatedAt: z.string().max(40).optional(),
      }),
    )
    .default([]),
  planning: z
    .object({
      effectivePersonnel: z.number().int().min(0).max(1000000).optional(),
      complexity: z.enum(['high', 'medium', 'low', 'limited']).optional(),
      siteCount: z.number().int().min(0).max(100000).optional(),
      stage: z.enum(['initial', 'surveillance', 'recertification']).optional(),
    })
    .optional(),
});

interface SeedChecklistItem {
  id: string;
  clauseId: string;
  clauseTitle: string;
  question: string;
  guidance?: string;
  ownerName: string;
  result: z.infer<typeof fieldResultSchema>;
  note?: string;
  evidenceIds: string[];
  updatedAt: string;
}

function seedChecklistItems(): SeedChecklistItem[] {
  const updatedAt = '2026-06-15T15:00:00.000Z';
  return [
    {
      id: 'item-4',
      clauseId: '4',
      clauseTitle: 'Context of the organization',
      question: 'What internal and external OHSMS context changes should the team verify during this audit?',
      guidance: 'Use auditee-authored context records, interviews, and site observations.',
      ownerName: 'Maya Chen',
      result: 'conform',
      evidenceIds: [],
      updatedAt,
    },
    {
      id: 'item-6',
      clauseId: '6',
      clauseTitle: 'Planning',
      question: 'Which planned controls, objectives, and evidence sources should be sampled for transition readiness?',
      guidance: 'Keep the prompt tied to auditee records and avoid copying standard text.',
      ownerName: 'Omar Patel',
      result: 'ofi',
      note: 'Objective tracking evidence partially available; confirm before signoff.',
      evidenceIds: [],
      updatedAt,
    },
    {
      id: 'item-8',
      clauseId: '8',
      clauseTitle: 'Operation',
      question: 'Which operational controls should be observed, photographed, or sampled during fieldwork?',
      guidance: 'Use photo evidence only where site rules allow it.',
      ownerName: 'Ava Brooks',
      result: 'notStarted',
      evidenceIds: [],
      updatedAt,
    },
  ];
}

async function ensureChecklist(db: Db, tenantId: string, auditId: string): Promise<unknown[]> {
  const collection = db.collection(mongoCollections.checklistItems);
  const existing = await collection.find({ tenantId, auditId }, { projection: { _id: 0 } }).sort({ clauseId: 1 }).toArray();
  if (existing.length > 0) {
    return existing;
  }
  const seeded = seedChecklistItems().map((item) => ({ ...item, tenantId, auditId }));
  await collection.insertMany(seeded.map((item) => ({ ...item })));
  return seeded;
}

export async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: RouteDependencies,
): Promise<void> {
  const corsOrigin = dependencies.config.corsOrigin;

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, null, corsOrigin);
    return;
  }

  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const isPublic =
      (request.method === 'GET' && url.pathname === '/api/health') ||
      (request.method === 'POST' && url.pathname === '/api/auth/login') ||
      (request.method === 'POST' && url.pathname === '/api/auth/superadmin-login') ||
      (request.method === 'POST' && url.pathname === '/api/auth/set-password') ||
      (request.method === 'GET' && url.pathname.startsWith('/api/auth/set-password/'));
    const actor = isPublic ? null : authenticateRequest(request, dependencies.config);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      await dependencies.db.command({ ping: 1 });
      sendJson(response, 200, { ok: true, backend: 'mongodb', database: dependencies.db.databaseName }, corsOrigin);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const command = await readJson(request, loginCommandSchema);
      // Throttle brute-force attempts by email + client IP.
      const fwd = request.headers['x-forwarded-for'];
      const clientIp = (Array.isArray(fwd) ? fwd[0] : fwd) ?? request.socket?.remoteAddress ?? 'local';
      const rateKey = `${command.email.toLowerCase()}|${clientIp}`;
      if (loginRateLimited(rateKey)) {
        sendJson(response, 429, { error: 'Too many failed sign-in attempts. Try again later.' }, corsOrigin);
        return;
      }
      const member = await dependencies.db
        .collection(mongoCollections.members)
        .findOne({ 'profile.email': command.email.toLowerCase(), status: 'active' });
      if (!member || typeof member['passwordHash'] !== 'string' || !verifyPassword(command.password, member['passwordHash'])) {
        recordLoginFailure(rateKey);
        throw new ApiAuthError('Invalid email or password.');
      }
      clearLoginFailures(rateKey);
      const profile = member['profile'] as { displayName?: string; email?: string } | undefined;
      const { token, expiresAt } = issueMemberToken(
        { uid: String(member['uid']), tenantId: String(member['tenantId']), role: String(member['role']) },
        dependencies.config,
      );
      sendJson(
        response,
        200,
        {
          token,
          expiresAt,
          user: {
            uid: member['uid'],
            tenantId: member['tenantId'],
            role: member['role'],
            displayName: profile?.displayName ?? '',
            email: profile?.email ?? command.email,
          },
        },
        corsOrigin,
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/superadmin-login') {
      const command = await readJson(request, superadminLoginCommandSchema);
      const fwd = request.headers['x-forwarded-for'];
      const clientIp = (Array.isArray(fwd) ? fwd[0] : fwd) ?? request.socket?.remoteAddress ?? 'local';
      const rateKey = `superadmin|${command.email.toLowerCase()}|${clientIp}`;
      if (loginRateLimited(rateKey)) {
        sendJson(response, 429, { error: 'Too many failed sign-in attempts. Try again later.' }, corsOrigin);
        return;
      }
      const member = await dependencies.db
        .collection(mongoCollections.members)
        .findOne({ 'profile.email': command.email.toLowerCase(), role: 'platformSuperadmin', status: 'active' });
      if (!member || typeof member['passwordHash'] !== 'string' || !verifyPassword(command.password, member['passwordHash'])) {
        recordLoginFailure(rateKey);
        throw new ApiAuthError('Invalid email or password.');
      }
      clearLoginFailures(rateKey);
      const profile = member['profile'] as { displayName?: string; email?: string } | undefined;
      const { token, expiresAt } = issuePlatformToken({ uid: String(member['uid']) }, dependencies.config);
      sendJson(
        response,
        200,
        {
          token,
          expiresAt,
          user: {
            uid: member['uid'],
            tenantId: null,
            role: 'platformSuperadmin',
            displayName: profile?.displayName ?? '',
            email: profile?.email ?? command.email,
          },
        },
        corsOrigin,
      );
      return;
    }

    const setPasswordInfoMatch = matchPath(/^\/api\/auth\/set-password\/([^/]+)$/, url.pathname, ['token']);
    if (request.method === 'GET' && setPasswordInfoMatch) {
      const info = await describeSetPasswordToken(dependencies.db, setPasswordInfoMatch.params['token']!);
      sendJson(response, 200, info, corsOrigin);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/set-password') {
      const command = await readJson(request, setPasswordCommandSchema);
      const identity = await consumeSetPasswordToken(dependencies.db, command.token);
      await dependencies.db.collection(mongoCollections.members).updateOne(
        { tenantId: identity.tenantId, uid: identity.uid },
        { $set: { passwordHash: hashPassword(command.password), status: 'active', updatedAt: new Date().toISOString() } },
      );
      await recordChange(dependencies.db, {
        tenantId: identity.tenantId ?? 'platform',
        actorUid: identity.uid,
        action: 'member.setPassword',
        target: 'member',
        targetId: identity.uid,
      });
      sendJson(response, 200, { ok: true }, corsOrigin);
      return;
    }

    // --- Platform superadmin console (/api/admin/*) --------------------------
    // Gated by requireSuperadmin (platform token). These deliberately do NOT call
    // requireTenant, which rejects platform tokens by design.
    if (request.method === 'POST' && url.pathname === '/api/admin/tenants' && actor) {
      requireSuperadmin(actor);
      const command = await readJson(request, provisionClientCommandSchema);
      // Idempotency: a retried provision returns the original result, no duplicate
      // tenant and no repeat invite emails.
      const priorJob = await dependencies.db
        .collection(mongoCollections.backendJobs)
        .findOne({ idempotencyKey: command.idempotencyKey });
      if (priorJob) {
        sendJson(response, 200, { tenantId: priorJob['resultRef'], idempotent: true, members: [] }, corsOrigin);
        return;
      }
      const now = new Date().toISOString();
      const tenantId = `tenant-${randomUUID()}`;
      await dependencies.db.collection(mongoCollections.tenants).insertOne({
        id: tenantId,
        name: command.tenantName.trim(),
        plan: command.plan,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      const provisioned: Array<{ member: ReturnType<typeof toMemberView>; link: string }> = [];
      provisioned.push(
        await inviteNewMember(dependencies, {
          tenantId,
          tenantName: command.tenantName,
          role: 'leadAuditor',
          email: command.leadAuditor.email,
          displayName: command.leadAuditor.displayName,
          actorUid: actor.uid,
        }),
      );
      for (const user of command.clientUsers) {
        provisioned.push(
          await inviteNewMember(dependencies, {
            tenantId,
            tenantName: command.tenantName,
            role: user.role,
            email: user.email,
            displayName: user.displayName,
            actorUid: actor.uid,
          }),
        );
      }
      await dependencies.db.collection(mongoCollections.backendJobs).insertOne(
        createBackendJob({
          tenantId,
          callableName: 'createTenant',
          requestedByUid: actor.uid,
          idempotencyKey: command.idempotencyKey,
          resultRef: tenantId,
        }),
      );
      await recordChange(dependencies.db, { tenantId, actorUid: actor.uid, action: 'tenant.provision', target: 'tenant', targetId: tenantId });
      const expose = dependencies.config.exposeSetPasswordLink;
      sendJson(
        response,
        201,
        {
          tenantId,
          members: provisioned.map((p) => ({ ...p.member, setPasswordLink: expose ? p.link : undefined })),
        },
        corsOrigin,
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/tenants' && actor) {
      requireSuperadmin(actor);
      const tenants = await dependencies.db
        .collection(mongoCollections.tenants)
        .find({}, { projection: { _id: 0 } })
        .toArray();
      const members = await dependencies.db
        .collection(mongoCollections.members)
        .find({}, { projection: { _id: 0, tenantId: 1 } })
        .toArray();
      const counts = members.reduce<Record<string, number>>((map, m) => {
        const t = String(m['tenantId'] ?? '');
        map[t] = (map[t] ?? 0) + 1;
        return map;
      }, {});
      sendJson(
        response,
        200,
        { tenants: tenants.map((t) => ({ ...t, memberCount: counts[String(t['id'])] ?? 0 })) },
        corsOrigin,
      );
      return;
    }

    const adminMembersMatch = matchPath(new RegExp(`^/api/admin/tenants/${tenantPath}/members$`), url.pathname, ['tenantId']);
    if (adminMembersMatch && actor) {
      requireSuperadmin(actor);
      const tenantId = adminMembersMatch.params['tenantId']!;
      if (request.method === 'GET') {
        const members = await dependencies.db
          .collection(mongoCollections.members)
          .find({ tenantId }, { projection: { _id: 0 } })
          .toArray();
        sendJson(response, 200, { members: members.map(toMemberView) }, corsOrigin);
        return;
      }
      if (request.method === 'POST') {
        const command = await readJson(request, addTenantUserCommandSchema);
        const tenant = await dependencies.db.collection(mongoCollections.tenants).findOne({ id: tenantId });
        if (!tenant) throw new ApiAuthError('Unknown tenant.');
        const { member, link } = await inviteNewMember(dependencies, {
          tenantId,
          tenantName: String(tenant['name'] ?? tenantId),
          role: command.role,
          email: command.email,
          displayName: command.displayName,
          actorUid: actor.uid,
        });
        sendJson(response, 201, { member, setPasswordLink: dependencies.config.exposeSetPasswordLink ? link : undefined }, corsOrigin);
        return;
      }
    }

    const adminMemberActionMatch = matchPath(
      new RegExp(`^/api/admin/tenants/${tenantPath}/members/([^/]+)/(resend|revoke)$`),
      url.pathname,
      ['tenantId', 'uid', 'action'],
    );
    if (request.method === 'POST' && adminMemberActionMatch && actor) {
      requireSuperadmin(actor);
      const { tenantId, uid, action } = adminMemberActionMatch.params as { tenantId: string; uid: string; action: string };
      const member = await dependencies.db.collection(mongoCollections.members).findOne({ tenantId, uid });
      if (!member) throw new ApiAuthError('User not found.');
      if (action === 'revoke') {
        await revokeSetPasswordTokens(dependencies.db, uid);
        await recordChange(dependencies.db, { tenantId, actorUid: actor.uid, action: 'link.revoke', target: 'member', targetId: uid });
        sendJson(response, 200, { ok: true }, corsOrigin);
        return;
      }
      const tenant = await dependencies.db.collection(mongoCollections.tenants).findOne({ id: tenantId });
      const profile = member['profile'] as { email?: string; displayName?: string } | undefined;
      const { link } = await issueSetPasswordToken(
        dependencies.db,
        { uid, tenantId, email: profile?.email ?? '', purpose: 'invite' },
        dependencies.config,
      );
      await (dependencies.mailer ?? defaultMailer).send(
        setPasswordEmail({
          to: profile?.email ?? '',
          displayName: profile?.displayName ?? '',
          tenantName: String(tenant?.['name'] ?? tenantId),
          link,
          purpose: 'invite',
        }),
      );
      await recordChange(dependencies.db, { tenantId, actorUid: actor.uid, action: 'link.resend', target: 'member', targetId: uid });
      sendJson(response, 200, { ok: true, setPasswordLink: dependencies.config.exposeSetPasswordLink ? link : undefined }, corsOrigin);
      return;
    }

    const adminMemberMatch = matchPath(new RegExp(`^/api/admin/tenants/${tenantPath}/members/([^/]+)$`), url.pathname, [
      'tenantId',
      'uid',
    ]);
    if (request.method === 'PUT' && adminMemberMatch && actor) {
      requireSuperadmin(actor);
      const { tenantId, uid } = adminMemberMatch.params as { tenantId: string; uid: string };
      const command = await readJson(request, memberStatusUpdateCommandSchema);
      const result = await dependencies.db
        .collection(mongoCollections.members)
        .updateOne({ tenantId, uid }, { $set: { status: command.status, updatedAt: new Date().toISOString() } });
      if (!result.matchedCount) throw new ApiAuthError('User not found.');
      await recordChange(dependencies.db, { tenantId, actorUid: actor.uid, action: `member.${command.status}`, target: 'member', targetId: uid });
      sendJson(response, 200, { ok: true }, corsOrigin);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/tenants') {
      if (!actor?.platform) {
        throw new ApiAuthError('Only platform superadmins can create tenants.');
      }

      const command = await readJson(request, tenantOnboardingCommandSchema);
      const now = new Date().toISOString();
      await dependencies.db.collection(mongoCollections.tenants).updateOne(
        { id: command.tenantId },
        {
          $setOnInsert: {
            id: command.tenantId,
            name: command.tenantName,
            plan: command.plan,
            status: 'active',
            createdAt: command.createdAt,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
      await dependencies.db.collection(mongoCollections.members).updateOne(
        { tenantId: command.tenantId, uid: command.adminUid },
        {
          $setOnInsert: {
            uid: command.adminUid,
            tenantId: command.tenantId,
            role: 'tenantAdmin',
            status: 'active',
            profile: { email: command.adminEmail, displayName: command.adminEmail },
            createdAt: now,
          },
        },
        { upsert: true },
      );
      const job = createBackendJob({
        tenantId: command.tenantId,
        callableName: 'createTenant',
        requestedByUid: actor.uid,
        idempotencyKey: command.idempotencyKey,
        resultRef: `/tenants/${command.tenantId}`,
      });
      await dependencies.db.collection(mongoCollections.backendJobs).updateOne(
        { idempotencyKey: job.idempotencyKey },
        { $setOnInsert: job },
        { upsert: true },
      );
      sendJson(response, 201, { tenantId: command.tenantId, job }, corsOrigin);
      return;
    }

    const inviteMatch = matchPath(new RegExp(`^/api/tenants/${tenantPath}/invites$`), url.pathname, ['tenantId']);
    if (request.method === 'POST' && inviteMatch && actor) {
      requireTenant(actor, inviteMatch.params['tenantId']!);
      requireAnyRole(actor, ['tenantAdmin', 'leadAuditor']);
      const command = tenantMemberInviteCommandSchema.parse({
        ...(await readJson(request, z.record(z.string(), z.unknown()))),
        tenantId: inviteMatch.params['tenantId'],
        invitedByUid: actor.uid,
      });
      const invite = {
        id: `invite-${randomUUID()}`,
        ...command,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await dependencies.db.collection(mongoCollections.invites).insertOne(invite);
      const job = createBackendJob({
        tenantId: command.tenantId,
        callableName: 'inviteTenantMember',
        requestedByUid: actor.uid,
        idempotencyKey: command.idempotencyKey,
        resultRef: `/tenants/${command.tenantId}/invites/${invite.id}`,
      });
      await dependencies.db.collection(mongoCollections.backendJobs).insertOne(job);
      sendJson(response, 201, { invite, job }, corsOrigin);
      return;
    }

    const claimsMatch = matchPath(new RegExp(`^/api/tenants/${tenantPath}/members/([^/]+)/claims$`), url.pathname, [
      'tenantId',
      'uid',
    ]);
    if (request.method === 'POST' && claimsMatch && actor) {
      requireTenant(actor, claimsMatch.params['tenantId']!);
      requireAnyRole(actor, ['tenantAdmin']);
      const command = memberClaimsAssignmentCommandSchema.parse({
        ...(await readJson(request, z.record(z.string(), z.unknown()))),
        tenantId: claimsMatch.params['tenantId'],
        uid: claimsMatch.params['uid'],
        assignedByUid: actor.uid,
      });
      await dependencies.db.collection(mongoCollections.members).updateOne(
        { tenantId: command.tenantId, uid: command.uid },
        { $set: { role: command.role, updatedAt: new Date().toISOString() } },
      );
      const job = createBackendJob({
        tenantId: command.tenantId,
        callableName: 'assignMemberClaims',
        requestedByUid: actor.uid,
        idempotencyKey: command.idempotencyKey,
        resultRef: `/tenants/${command.tenantId}/members/${command.uid}`,
      });
      await dependencies.db.collection(mongoCollections.backendJobs).insertOne(job);
      sendJson(response, 202, { job }, corsOrigin);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/change-password' && actor) {
      const command = await readJson(
        request,
        z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }),
      );
      const member = await dependencies.db
        .collection(mongoCollections.members)
        .findOne({ tenantId: actor.tenantId, uid: actor.uid });
      if (!member || typeof member['passwordHash'] !== 'string' || !verifyPassword(command.currentPassword, member['passwordHash'])) {
        throw new ApiAuthError('Current password is incorrect.');
      }
      await dependencies.db
        .collection(mongoCollections.members)
        .updateOne({ tenantId: actor.tenantId, uid: actor.uid }, { $set: { passwordHash: hashPassword(command.newPassword), updatedAt: new Date().toISOString() } });
      sendJson(response, 200, { ok: true }, corsOrigin);
      return;
    }

    // --- Delegated member management (lead auditor / tenant admin) -----------
    const membersMatch = matchPath(new RegExp(`^/api/tenants/${tenantPath}/members$`), url.pathname, ['tenantId']);
    if (membersMatch && actor) {
      const tenantId = membersMatch.params['tenantId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['tenantAdmin', 'leadAuditor']);
      if (request.method === 'GET') {
        const members = await dependencies.db
          .collection(mongoCollections.members)
          .find({ tenantId }, { projection: { _id: 0 } })
          .sort({ createdAt: 1 })
          .toArray();
        sendJson(response, 200, { members: members.map(toMemberView) }, corsOrigin);
        return;
      }
      if (request.method === 'POST') {
        const command = await readJson(request, addTenantUserCommandSchema);
        if (command.role === 'tenantAdmin' && actor.role !== 'tenantAdmin') {
          throw new ApiAuthError('Only a tenant admin can create another tenant admin.');
        }
        const tenant = await dependencies.db.collection(mongoCollections.tenants).findOne({ id: tenantId });
        const { member, link } = await inviteNewMember(dependencies, {
          tenantId,
          tenantName: String(tenant?.['name'] ?? tenantId),
          role: command.role,
          email: command.email,
          displayName: command.displayName,
          actorUid: actor.uid,
        });
        sendJson(response, 201, { member, setPasswordLink: dependencies.config.exposeSetPasswordLink ? link : undefined }, corsOrigin);
        return;
      }
    }

    const memberPasswordMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/members/([^/]+)/password$`),
      url.pathname,
      ['tenantId', 'uid'],
    );
    if (request.method === 'POST' && memberPasswordMatch && actor) {
      const { tenantId, uid } = memberPasswordMatch.params as { tenantId: string; uid: string };
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['tenantAdmin', 'leadAuditor']);
      const member = await dependencies.db.collection(mongoCollections.members).findOne({ tenantId, uid });
      if (!member) throw new ApiAuthError('User not found.');
      const tenant = await dependencies.db.collection(mongoCollections.tenants).findOne({ id: tenantId });
      const profile = member['profile'] as { email?: string; displayName?: string } | undefined;
      const { link } = await issueSetPasswordToken(
        dependencies.db,
        { uid, tenantId, email: profile?.email ?? '', purpose: 'reset' },
        dependencies.config,
      );
      await (dependencies.mailer ?? defaultMailer).send(
        setPasswordEmail({
          to: profile?.email ?? '',
          displayName: profile?.displayName ?? '',
          tenantName: String(tenant?.['name'] ?? tenantId),
          link,
          purpose: 'reset',
        }),
      );
      await recordChange(dependencies.db, { tenantId, actorUid: actor.uid, action: 'member.passwordReset', target: 'member', targetId: uid });
      sendJson(response, 200, { ok: true, setPasswordLink: dependencies.config.exposeSetPasswordLink ? link : undefined }, corsOrigin);
      return;
    }

    const memberUpdateMatch = matchPath(new RegExp(`^/api/tenants/${tenantPath}/members/([^/]+)$`), url.pathname, [
      'tenantId',
      'uid',
    ]);
    if (request.method === 'PUT' && memberUpdateMatch && actor) {
      const { tenantId, uid } = memberUpdateMatch.params as { tenantId: string; uid: string };
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['tenantAdmin', 'leadAuditor']);
      const command = await readJson(
        request,
        z.object({
          role: z.enum(['tenantAdmin', 'leadAuditor', 'auditor', 'clientViewer']).optional(),
          status: z.enum(['active', 'disabled']).optional(),
          displayName: z.string().min(1).max(200).optional(),
        }),
      );
      const target = await dependencies.db.collection(mongoCollections.members).findOne({ tenantId, uid });
      if (!target) throw new ApiAuthError('User not found.');
      const patch: Record<string, unknown> = {};
      if (command.role) {
        if (command.role === 'tenantAdmin' && actor.role !== 'tenantAdmin') {
          throw new ApiAuthError('Only a tenant admin can grant tenant admin.');
        }
        if (uid === actor.uid && command.role !== actor.role) {
          throw new ApiAuthError('You cannot change your own role.');
        }
        patch['role'] = command.role;
      }
      if (command.status) {
        if (uid === actor.uid && command.status !== 'active') {
          throw new ApiAuthError('You cannot deactivate your own account.');
        }
        patch['status'] = command.status;
      }
      if (command.displayName) {
        patch['profile'] = { ...(target['profile'] as object), displayName: command.displayName.trim() };
      }
      if (Object.keys(patch).length === 0) {
        sendJson(response, 400, { error: 'Nothing to update.' }, corsOrigin);
        return;
      }
      patch['updatedAt'] = new Date().toISOString();
      await dependencies.db.collection(mongoCollections.members).updateOne({ tenantId, uid }, { $set: patch });
      const updated = await dependencies.db.collection(mongoCollections.members).findOne({ tenantId, uid });
      sendJson(response, 200, { member: toMemberView(updated as Record<string, unknown>) }, corsOrigin);
      return;
    }

    const uploadMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/evidence/upload-intents$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && uploadMatch && actor) {
      requireTenant(actor, uploadMatch.params['tenantId']!);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = evidenceUploadIntentCommandSchema.parse({
        ...(await readJson(request, z.record(z.string(), z.unknown()))),
        tenantId: uploadMatch.params['tenantId'],
        auditId: uploadMatch.params['auditId'],
        capturedByUid: actor.uid,
      });
      const now = new Date().toISOString();
      const evidenceId = `evidence-${randomUUID()}`;
      const intent = evidenceUploadIntentSchema.parse({
        id: `upload-${randomUUID()}`,
        tenantId: command.tenantId,
        auditId: command.auditId,
        evidenceId,
        storageRef: buildPhotoEvidenceStorageRef(command, evidenceId),
        metadataPath: buildEvidenceMetadataPath(command, evidenceId),
        status: 'created',
        createdByUid: actor.uid,
        createdAt: now,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      await dependencies.db.collection(mongoCollections.evidenceUploadIntents).updateOne(
        { idempotencyKey: command.idempotencyKey },
        { $setOnInsert: { ...intent, idempotencyKey: command.idempotencyKey, command } },
        { upsert: true },
      );
      const job = createBackendJob({
        tenantId: command.tenantId,
        auditId: command.auditId,
        callableName: 'createEvidenceUploadIntent',
        requestedByUid: actor.uid,
        idempotencyKey: command.idempotencyKey,
        resultRef: intent.metadataPath,
      });
      await dependencies.db.collection(mongoCollections.backendJobs).updateOne(
        { idempotencyKey: job.idempotencyKey },
        { $setOnInsert: job },
        { upsert: true },
      );
      sendJson(response, 201, { intent, job }, corsOrigin);
      return;
    }

    const photoMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/photo-analysis-jobs$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && photoMatch && actor) {
      requireTenant(actor, photoMatch.params['tenantId']!);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = photoAnalysisRequestCommandSchema.parse({
        ...(await readJson(request, z.record(z.string(), z.unknown()))),
        tenantId: photoMatch.params['tenantId'],
        auditId: photoMatch.params['auditId'],
        requestedByUid: actor.uid,
      });
      const job = createBackendJob({
        tenantId: command.tenantId,
        auditId: command.auditId,
        callableName: 'requestPhotoAnalysis',
        requestedByUid: actor.uid,
        idempotencyKey: command.idempotencyKey,
        resultRef: `/tenants/${command.tenantId}/audits/${command.auditId}/photoAnalyses/${command.evidenceId}`,
      });
      await dependencies.db.collection(mongoCollections.backendJobs).insertOne(job);
      sendJson(response, 202, { job }, corsOrigin);
      return;
    }

    const reportMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/reports/${reportPath}/pdf-jobs$`),
      url.pathname,
      ['tenantId', 'auditId', 'reportId'],
    );
    if (request.method === 'POST' && reportMatch && actor) {
      requireTenant(actor, reportMatch.params['tenantId']!);
      requireAnyRole(actor, ['leadAuditor']);
      const command = reportPdfGenerationCommandSchema.parse({
        ...(await readJson(request, z.record(z.string(), z.unknown()))),
        tenantId: reportMatch.params['tenantId'],
        auditId: reportMatch.params['auditId'],
        reportId: reportMatch.params['reportId'],
        requestedByUid: actor.uid,
      });
      const job = createBackendJob({
        tenantId: command.tenantId,
        auditId: command.auditId,
        callableName: 'generateAuditReportPdf',
        requestedByUid: actor.uid,
        idempotencyKey: command.idempotencyKey,
        resultRef: `/tenants/${command.tenantId}/audits/${command.auditId}/reports/${command.reportId}`,
      });
      await dependencies.db.collection(mongoCollections.backendJobs).insertOne(job);
      sendJson(response, 202, { job }, corsOrigin);
      return;
    }

    const reminderMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/capa/${capaPath}/reminders$`),
      url.pathname,
      ['tenantId', 'auditId', 'capaId'],
    );
    if (request.method === 'POST' && reminderMatch && actor) {
      requireTenant(actor, reminderMatch.params['tenantId']!);
      requireAnyRole(actor, ['tenantAdmin', 'leadAuditor']);
      const command = capaReminderScheduleCommandSchema.parse({
        ...(await readJson(request, z.record(z.string(), z.unknown()))),
        tenantId: reminderMatch.params['tenantId'],
        auditId: reminderMatch.params['auditId'],
        capaId: reminderMatch.params['capaId'],
        requestedByUid: actor.uid,
      });
      const reminder = {
        id: `reminder-${randomUUID()}`,
        ...command,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      };
      await dependencies.db.collection(mongoCollections.capaReminders).insertOne(reminder);
      const job = createBackendJob({
        tenantId: command.tenantId,
        auditId: command.auditId,
        callableName: 'scheduleCapaReminder',
        requestedByUid: actor.uid,
        idempotencyKey: command.idempotencyKey,
        resultRef: `/tenants/${command.tenantId}/audits/${command.auditId}/capa/${command.capaId}`,
      });
      await dependencies.db.collection(mongoCollections.backendJobs).insertOne(job);
      sendJson(response, 201, { reminder, job }, corsOrigin);
      return;
    }

    const fieldStateMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/field-state$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'GET' && fieldStateMatch && actor) {
      const tenantId = fieldStateMatch.params['tenantId']!;
      const auditId = fieldStateMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      const evidenceCollection = dependencies.db.collection(mongoCollections.evidence);
      const findingsCollection = dependencies.db.collection(mongoCollections.findings);
      const capaCollection = dependencies.db.collection(mongoCollections.capa);
      const [items, evidence, findings, capas, auditDoc, meetings, conclusion] = await Promise.all([
        ensureChecklist(dependencies.db, tenantId, auditId),
        evidenceCollection.find({ tenantId, auditId }, { projection: { _id: 0 } }).sort({ capturedAt: -1 }).toArray(),
        findingsCollection.find({ tenantId, auditId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
        capaCollection.find({ tenantId, auditId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
        dependencies.db.collection(mongoCollections.audits).findOne({ tenantId, id: auditId }, { projection: { _id: 0 } }),
        dependencies.db.collection(mongoCollections.auditMeetings).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.auditConclusions).findOne({ tenantId, auditId }, { projection: { _id: 0 } }),
      ]);
      const [aspects, obligations, emergencyRecords, interestedParties, objectives, communications, managementReviews] =
        await Promise.all([
          dependencies.db.collection(mongoCollections.environmentalAspects).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
          dependencies.db.collection(mongoCollections.complianceObligations).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
          dependencies.db.collection(mongoCollections.emergencyRecords).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
          dependencies.db.collection(mongoCollections.interestedParties).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
          dependencies.db.collection(mongoCollections.environmentalObjectives).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
          dependencies.db.collection(mongoCollections.communicationRecords).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
          dependencies.db.collection(mongoCollections.managementReviews).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        ]);
      const [risksOpportunities, resources, competence, awareness, documentedInfo, performanceMetrics] = await Promise.all([
        dependencies.db.collection(mongoCollections.risksOpportunities).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.resourceRecords).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.competenceRecords).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.awarenessRecords).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.documentedInfo).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.performanceMetrics).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
      ]);
      const [permits, incidents, hira] = await Promise.all([
        dependencies.db.collection(mongoCollections.permits).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.incidents).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
        dependencies.db.collection(mongoCollections.hira).find({ tenantId, auditId }, { projection: { _id: 0 } }).toArray(),
      ]);
      const calibration = await dependencies.db
        .collection(mongoCollections.calibration)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const training = await dependencies.db
        .collection(mongoCollections.training)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const suppliers = await dependencies.db
        .collection(mongoCollections.suppliers)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const changes = await dependencies.db
        .collection(mongoCollections.changes)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const operationalControls = await dependencies.db
        .collection(mongoCollections.operationalControls)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const workerConsultations = await dependencies.db
        .collection(mongoCollections.workerConsultations)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const workers = await dependencies.db
        .collection(mongoCollections.workers)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const sites = await dependencies.db
        .collection(mongoCollections.sites)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .toArray();
      const reportMeta = await dependencies.db
        .collection(mongoCollections.reportMeta)
        .findOne({ tenantId, auditId }, { projection: { _id: 0 } });
      const changeLog = await dependencies.db
        .collection(mongoCollections.changeLog)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .sort({ at: -1 })
        .toArray();
      const evidenceRequests = await dependencies.db
        .collection(mongoCollections.evidenceRequests)
        .find({ tenantId, auditId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
      sendJson(
        response,
        200,
        {
          items,
          evidence,
          evidenceRequests,
          findings,
          capas,
          auditStatus: auditDoc?.['status'] ?? 'fieldwork',
          meetings,
          conclusion,
          aspects,
          obligations,
          emergencyRecords,
          interestedParties,
          objectives,
          communications,
          managementReviews,
          risksOpportunities,
          resources,
          competence,
          workers,
          sites,
          awareness,
          documentedInfo,
          performanceMetrics,
          permits,
          incidents,
          hira,
          calibration,
          training,
          suppliers,
          changes,
          operationalControls,
          workerConsultations,
          reportMeta,
          changeLog,
        },
        corsOrigin,
      );
      return;
    }

    const checklistMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/checklist/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'itemId'],
    );
    if (request.method === 'PUT' && checklistMatch && actor) {
      requireTenant(actor, checklistMatch.params['tenantId']!);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, checklistResultCommandSchema);
      await dependencies.db.collection(mongoCollections.checklistItems).updateOne(
        {
          tenantId: checklistMatch.params['tenantId'],
          auditId: checklistMatch.params['auditId'],
          id: checklistMatch.params['itemId'],
        },
        { $set: { result: command.result, note: command.note ?? null, updatedAt: new Date().toISOString() } },
      );
      sendJson(response, 200, { ok: true }, corsOrigin);
      return;
    }

    const evidenceMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/evidence$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && evidenceMatch && actor) {
      const tenantId = evidenceMatch.params['tenantId']!;
      const auditId = evidenceMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, evidenceCreateCommandSchema);
      const record = { ...command, tenantId, auditId, createdBy: actor.uid };
      await dependencies.db
        .collection(mongoCollections.evidence)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      if (command.itemId) {
        await dependencies.db
          .collection(mongoCollections.checklistItems)
          .updateOne({ tenantId, auditId, id: command.itemId }, { $addToSet: { evidenceIds: command.id } });
      }
      sendJson(response, 201, { evidence: record }, corsOrigin);
      return;
    }

    // AI photo-evidence analysis (server-side vision). Inert until ANTHROPIC_API_KEY
    // + a vision model (ANTHROPIC_VISION_MODEL or ANTHROPIC_MODEL) are set → 501
    // ai_not_configured, so the client shows the graceful "needs the server/key"
    // state. Returns a candidate (observations / hazard tags / suggested clause +
    // finding) with status needsAuditorReview — the auditor accepts/rejects; nothing
    // is auto-applied. The prompt forbids verbatim ISO requirement text (copyright).
    const photoAnalyzeMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/evidence/([^/]+)/analyze$`),
      url.pathname,
      ['tenantId', 'auditId', 'evidenceId'],
    );
    if (request.method === 'POST' && photoAnalyzeMatch && actor) {
      const tenantId = photoAnalyzeMatch.params['tenantId']!;
      const auditId = photoAnalyzeMatch.params['auditId']!;
      const evidenceId = photoAnalyzeMatch.params['evidenceId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const body = await readJson(request, z.object({ imageBase64: z.string().optional(), mimeType: z.string().optional() }).passthrough());
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      const model = process.env['ANTHROPIC_VISION_MODEL'] ?? process.env['ANTHROPIC_MODEL'];
      if (!apiKey || !model) {
        sendJson(response, 501, { error: 'ai_not_configured' }, corsOrigin);
        return;
      }
      // Prefer image bytes supplied in the body; otherwise look up the stored evidence.
      let imageBase64 = typeof body['imageBase64'] === 'string' ? (body['imageBase64'] as string) : undefined;
      let mimeType = typeof body['mimeType'] === 'string' ? (body['mimeType'] as string) : 'image/jpeg';
      if (!imageBase64) {
        const evidence = await dependencies.db
          .collection(mongoCollections.evidence)
          .findOne({ tenantId, auditId, id: evidenceId });
        const stored = evidence as { imageBase64?: string; media?: { mimeType?: string } } | null;
        if (stored?.imageBase64) {
          imageBase64 = stored.imageBase64;
          mimeType = stored.media?.mimeType ?? mimeType;
        }
      }
      if (!imageBase64) {
        sendJson(response, 422, { error: 'no_image' }, corsOrigin);
        return;
      }
      const system =
        'You are an ISO 45001 occupational health & safety auditor assistant reviewing a single site photo. Suggest only what is visible. Use ISO 45001 clause numbers and short titles only; do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only with keys: observations (string[]), hazardTags (string[]), suggestedClauseId (string), suggestedFindingStatement (string), suggestedType (one of minorNc, majorNc, ofi, conformity). Every suggestion is a candidate for an auditor to review; do not assert conclusions.';
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            system,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                  { type: 'text', text: 'Analyze this OH&S site photo and return the JSON object.' },
                ],
              },
            ],
          }),
        });
        if (!aiRes.ok) {
          sendJson(response, 502, { error: 'ai_upstream' }, corsOrigin);
          return;
        }
        const payload = (await aiRes.json()) as { content?: { text?: string }[] };
        const text = (payload.content ?? []).map((part) => part.text ?? '').join('');
        const found = text.match(/\{[\s\S]*\}/);
        const parsed = found ? (JSON.parse(found[0]) as Record<string, unknown>) : null;
        if (!parsed) {
          sendJson(response, 502, { error: 'ai_parse' }, corsOrigin);
          return;
        }
        const types = ['minorNc', 'majorNc', 'ofi', 'conformity'];
        const rawType = parsed['suggestedType'];
        const stringList = (value: unknown): string[] =>
          Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        sendJson(
          response,
          200,
          {
            status: 'needsAuditorReview',
            observations: stringList(parsed['observations']),
            hazardTags: stringList(parsed['hazardTags']),
            suggestedClauseId: typeof parsed['suggestedClauseId'] === 'string' ? parsed['suggestedClauseId'] : undefined,
            suggestedFindingStatement:
              typeof parsed['suggestedFindingStatement'] === 'string' ? parsed['suggestedFindingStatement'] : undefined,
            suggestedType: typeof rawType === 'string' && types.includes(rawType) ? rawType : 'ofi',
            provider: 'anthropicClaude',
            generatedAt: new Date().toISOString(),
          },
          corsOrigin,
        );
        return;
      } catch {
        sendJson(response, 502, { error: 'ai_failed' }, corsOrigin);
        return;
      }
    }

    const findingConfirmMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/findings/([^/]+)/confirm$`),
      url.pathname,
      ['tenantId', 'auditId', 'findingId'],
    );
    if (request.method === 'POST' && findingConfirmMatch && actor) {
      requireTenant(actor, findingConfirmMatch.params['tenantId']!);
      requireAnyRole(actor, ['leadAuditor']);
      await dependencies.db.collection(mongoCollections.findings).updateOne(
        {
          tenantId: findingConfirmMatch.params['tenantId'],
          auditId: findingConfirmMatch.params['auditId'],
          id: findingConfirmMatch.params['findingId'],
        },
        { $set: { status: 'auditorConfirmed', confirmedAt: new Date().toISOString() } },
      );
      sendJson(response, 200, { ok: true }, corsOrigin);
      return;
    }

    const findingsMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/findings$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && findingsMatch && actor) {
      const tenantId = findingsMatch.params['tenantId']!;
      const auditId = findingsMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, findingCreateCommandSchema);
      const record = { ...command, tenantId, auditId, status: 'draft' as const, createdByUid: actor.uid };
      await dependencies.db
        .collection(mongoCollections.findings)
        .updateOne({ tenantId, auditId, id: command.id }, { $setOnInsert: record }, { upsert: true });
      sendJson(response, 201, { finding: record }, corsOrigin);
      return;
    }

    const findingUpsertMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/findings/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'findingId'],
    );
    if (request.method === 'PUT' && findingUpsertMatch && actor) {
      const tenantId = findingUpsertMatch.params['tenantId']!;
      const auditId = findingUpsertMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, findingUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedBy: actor.uid, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.findings)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      await recordChange(dependencies.db, { tenantId, auditId, actorUid: actor.uid, action: 'upsert', target: 'finding', targetId: command.id });
      sendJson(response, 200, { finding: record }, corsOrigin);
      return;
    }

    const evidenceRequestMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/evidence-requests/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'requestId'],
    );
    if (request.method === 'PUT' && evidenceRequestMatch && actor) {
      const tenantId = evidenceRequestMatch.params['tenantId']!;
      const auditId = evidenceRequestMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor', 'clientViewer']);
      const command = await readJson(request, evidenceRequestSchema);
      const collection = dependencies.db.collection(mongoCollections.evidenceRequests);
      const now = new Date().toISOString();

      if (actor.role === 'clientViewer') {
        // Auditee write boundary: the client may only append their own
        // submissions and post messages. The auditor owns the request
        // definition (title/clause/due) and the accept/return decision, so we
        // merge onto the stored record instead of trusting the full body, and
        // stamp auditee authorship on any new thread messages. Status advances
        // to "submitted" only when fresh evidence is attached.
        const existing = await collection.findOne({ tenantId, auditId, id: command.id }, { projection: { _id: 0 } });
        if (!existing) {
          throw new ApiAuthError('Auditees cannot create evidence requests.');
        }
        const priorMessageIds = new Set(
          ((existing['messages'] as { id: string }[] | undefined) ?? []).map((m) => m.id),
        );
        const messages = command.messages.map((m) => (priorMessageIds.has(m.id) ? m : { ...m, author: 'auditee' as const }));
        const grew = command.submissions.length > ((existing['submissions'] as unknown[] | undefined)?.length ?? 0);
        const status = grew ? 'submitted' : (existing['status'] as string);
        const record = {
          ...existing,
          tenantId,
          auditId,
          id: command.id,
          submissions: command.submissions,
          messages,
          status,
          updatedAt: now,
        };
        await collection.updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
        await recordChange(dependencies.db, { tenantId, auditId, actorUid: actor.uid, action: 'auditee-update', target: 'evidenceRequest', targetId: command.id });
        sendJson(response, 200, { evidenceRequest: record }, corsOrigin);
        return;
      }

      const record = { ...command, tenantId, auditId, updatedBy: actor.uid, updatedAt: now };
      await collection.updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      await recordChange(dependencies.db, { tenantId, auditId, actorUid: actor.uid, action: 'upsert', target: 'evidenceRequest', targetId: command.id });
      sendJson(response, 200, { evidenceRequest: record }, corsOrigin);
      return;
    }

    const capaVerifyMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/capa/([^/]+)/verify$`),
      url.pathname,
      ['tenantId', 'auditId', 'capaId'],
    );
    if (request.method === 'POST' && capaVerifyMatch && actor) {
      const tenantId = capaVerifyMatch.params['tenantId']!;
      const auditId = capaVerifyMatch.params['auditId']!;
      const capaId = capaVerifyMatch.params['capaId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor']);
      const command = await readJson(request, capaVerifyCommandSchema);
      const now = new Date().toISOString();
      await dependencies.db.collection(mongoCollections.capa).updateOne(
        { tenantId, auditId, id: capaId },
        {
          $set: {
            status: command.effective ? 'verified' : 'inProgress',
            verification: command.verification,
            verificationEvidenceIds: command.verificationEvidenceIds,
            verifiedByUid: actor.uid,
            verifiedAt: now,
          },
        },
      );
      await dependencies.db
        .collection(mongoCollections.findings)
        .updateOne(
          { tenantId, auditId, id: command.findingId },
          { $set: { status: command.effective ? 'closed' : 'reopened', updatedAt: now } },
        );
      await recordChange(dependencies.db, {
        tenantId,
        auditId,
        actorUid: actor.uid,
        action: command.effective ? 'verify-effective' : 'verify-ineffective',
        target: 'capa',
        targetId: capaId,
      });
      sendJson(response, 200, { ok: true }, corsOrigin);
      return;
    }

    const capaUpsertMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/capa/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'capaId'],
    );
    if (request.method === 'PUT' && capaUpsertMatch && actor) {
      const tenantId = capaUpsertMatch.params['tenantId']!;
      const auditId = capaUpsertMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, capaUpsertCommandSchema);
      // Effectiveness verification is lead-only and must go through /verify.
      const status = command.status === 'verified' ? 'verificationDue' : command.status;
      const record = {
        ...command,
        status,
        tenantId,
        auditId,
        findingRef: command.findingId,
        updatedAt: new Date().toISOString(),
      };
      await dependencies.db
        .collection(mongoCollections.capa)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { capa: record }, corsOrigin);
      return;
    }

    const statusMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/status$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'PUT' && statusMatch && actor) {
      const tenantId = statusMatch.params['tenantId']!;
      const auditId = statusMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor']);
      const command = await readJson(request, auditStatusCommandSchema);
      await dependencies.db
        .collection(mongoCollections.audits)
        .updateOne(
          { tenantId, id: auditId },
          { $set: { tenantId, id: auditId, status: command.status, updatedAt: new Date().toISOString() } },
          { upsert: true },
        );
      await recordChange(dependencies.db, { tenantId, auditId, actorUid: actor.uid, action: 'set-status', target: 'audit', targetId: command.status });
      sendJson(response, 200, { ok: true }, corsOrigin);
      return;
    }

    const meetingMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/meetings/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'meetingId'],
    );
    if (request.method === 'PUT' && meetingMatch && actor) {
      const tenantId = meetingMatch.params['tenantId']!;
      const auditId = meetingMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, meetingUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.auditMeetings)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { meeting: record }, corsOrigin);
      return;
    }

    const conclusionMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/conclusion$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'PUT' && conclusionMatch && actor) {
      const tenantId = conclusionMatch.params['tenantId']!;
      const auditId = conclusionMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor']);
      const command = await readJson(request, conclusionCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.auditConclusions)
        .updateOne({ tenantId, auditId }, { $set: record }, { upsert: true });
      sendJson(response, 200, { conclusion: record }, corsOrigin);
      return;
    }

    const reportMetaMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/report-meta$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'PUT' && reportMetaMatch && actor) {
      const tenantId = reportMetaMatch.params['tenantId']!;
      const auditId = reportMetaMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, reportMetaCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.reportMeta)
        .updateOne({ tenantId, auditId }, { $set: record }, { upsert: true });
      sendJson(response, 200, { reportMeta: record }, corsOrigin);
      return;
    }

    // AI report draft (server-side). Inert until ANTHROPIC_API_KEY + ANTHROPIC_MODEL
    // are set; the client falls back to its offline rule-based composer on any
    // non-2xx. The prompt forbids verbatim ISO requirement text (copyright guardrail).
    const reportDraftMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/report-draft$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && reportDraftMatch && actor) {
      const tenantId = reportDraftMatch.params['tenantId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const input = await readJson(request, z.object({}).passthrough());
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      const model = process.env['ANTHROPIC_MODEL'];
      if (!apiKey || !model) {
        sendJson(response, 501, { error: 'ai_not_configured' }, corsOrigin);
        return;
      }
      const system =
        'You are an ISO 45001 lead auditor assistant drafting an audit report. Use ONLY the audit data provided and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only, with keys overallConformity, emsEffectivenessOpinion, criteriaMetStatement, recommendation. recommendation must be one of recommend, conditional, notRecommended, satisfactory, actionRequired.';
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model,
            max_tokens: 1200,
            system,
            messages: [{ role: 'user', content: `Audit data:\n${JSON.stringify(input)}` }],
          }),
        });
        if (!aiRes.ok) {
          sendJson(response, 502, { error: 'ai_upstream' }, corsOrigin);
          return;
        }
        const payload = (await aiRes.json()) as { content?: { text?: string }[] };
        const text = (payload.content ?? []).map((part) => part.text ?? '').join('');
        const found = text.match(/\{[\s\S]*\}/);
        const parsed = found ? (JSON.parse(found[0]) as Record<string, unknown>) : null;
        if (!parsed) {
          sendJson(response, 502, { error: 'ai_parse' }, corsOrigin);
          return;
        }
        const recs = ['recommend', 'conditional', 'notRecommended', 'satisfactory', 'actionRequired'];
        const rawRec = parsed['recommendation'];
        const recommendation = typeof rawRec === 'string' && recs.includes(rawRec) ? rawRec : 'satisfactory';
        sendJson(
          response,
          200,
          {
            overallConformity: String(parsed['overallConformity'] ?? ''),
            emsEffectivenessOpinion: String(parsed['emsEffectivenessOpinion'] ?? ''),
            criteriaMetStatement: String(parsed['criteriaMetStatement'] ?? ''),
            recommendation,
            source: 'ai',
            generatedAt: new Date().toISOString(),
          },
          corsOrigin,
        );
        return;
      } catch {
        sendJson(response, 502, { error: 'ai_failed' }, corsOrigin);
        return;
      }
    }

    // AI audit agenda + opening/closing meeting scripts (server-side). Inert until
    // ANTHROPIC_API_KEY + ANTHROPIC_MODEL are set; the client falls back to its
    // offline rule-based composer on any non-2xx. The prompt forbids verbatim ISO
    // requirement text (copyright guardrail).
    const agendaDraftMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/agenda-draft$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && agendaDraftMatch && actor) {
      const tenantId = agendaDraftMatch.params['tenantId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const input = await readJson(request, z.object({}).passthrough());
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      const model = process.env['ANTHROPIC_MODEL'];
      if (!apiKey || !model) {
        sendJson(response, 501, { error: 'ai_not_configured' }, corsOrigin);
        return;
      }
      const system =
        'You are an ISO 45001 lead auditor assistant drafting (a) a tailored audit agenda and (b) opening- and closing-meeting talking-point scripts. Use ONLY the audit data provided and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only, with two keys: "agenda" and "scripts". "agenda" has keys title, scope, criteria, objectives (string array), itinerary (array of {clause, title, duration, focus}) and samplingNotes (string array). "scripts" has keys opening and closing, each an object with heading and talkingPoints (string array). The opening script covers introductions, confidentiality, safety induction/PPE/permits, scope+criteria+methods, the sampling caveat, how findings are graded and communicated, and closing-meeting arrangements. The closing script covers a findings summary by grade, agreed correction timelines (major ~30 days, minor ~90 days), auditee acknowledgement, and the recommendation plus next steps.';
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model,
            max_tokens: 2000,
            system,
            messages: [{ role: 'user', content: `Audit data:\n${JSON.stringify(input)}` }],
          }),
        });
        if (!aiRes.ok) {
          sendJson(response, 502, { error: 'ai_upstream' }, corsOrigin);
          return;
        }
        const payload = (await aiRes.json()) as { content?: { text?: string }[] };
        const text = (payload.content ?? []).map((part) => part.text ?? '').join('');
        const found = text.match(/\{[\s\S]*\}/);
        const parsed = found ? (JSON.parse(found[0]) as Record<string, unknown>) : null;
        if (!parsed) {
          sendJson(response, 502, { error: 'ai_parse' }, corsOrigin);
          return;
        }
        const generatedAt = new Date().toISOString();
        const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')) : []);
        const agendaIn = (parsed['agenda'] ?? {}) as Record<string, unknown>;
        const scriptsIn = (parsed['scripts'] ?? {}) as Record<string, unknown>;
        const itinerary = Array.isArray(agendaIn['itinerary'])
          ? (agendaIn['itinerary'] as Record<string, unknown>[]).map((slot) => ({
              clause: String(slot?.['clause'] ?? ''),
              title: String(slot?.['title'] ?? ''),
              duration: String(slot?.['duration'] ?? ''),
              focus: String(slot?.['focus'] ?? ''),
            }))
          : [];
        const script = (s: unknown, heading: string) => {
          const obj = (s ?? {}) as Record<string, unknown>;
          return { heading: String(obj['heading'] ?? heading), talkingPoints: strArr(obj['talkingPoints']) };
        };
        sendJson(
          response,
          200,
          {
            agenda: {
              title: String(agendaIn['title'] ?? ''),
              scope: String(agendaIn['scope'] ?? ''),
              criteria: String(agendaIn['criteria'] ?? ''),
              objectives: strArr(agendaIn['objectives']),
              itinerary,
              samplingNotes: strArr(agendaIn['samplingNotes']),
              source: 'ai',
              generatedAt,
            },
            scripts: {
              opening: script(scriptsIn['opening'], 'Opening meeting'),
              closing: script(scriptsIn['closing'], 'Closing meeting'),
              source: 'ai',
              generatedAt,
            },
          },
          corsOrigin,
        );
        return;
      } catch {
        sendJson(response, 502, { error: 'ai_failed' }, corsOrigin);
        return;
      }
    }

    // AI "ask the standard" copilot (server-side). Inert until ANTHROPIC_API_KEY +
    // ANTHROPIC_MODEL are set; the client falls back to its offline field-guide
    // answerer on any non-2xx. The prompt forbids verbatim ISO requirement text.
    const copilotMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/copilot/ask$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && copilotMatch && actor) {
      const tenantId = copilotMatch.params['tenantId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const body = await readJson(request, z.object({ question: z.string().min(1).max(2000) }));
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      const model = process.env['ANTHROPIC_MODEL'];
      if (!apiKey || !model) {
        sendJson(response, 501, { error: 'ai_not_configured' }, corsOrigin);
        return;
      }
      const system =
        "You are an ISO 45001 lead auditor assistant. Answer the auditor's question using ISO 45001 clause numbers and short titles plus general OH&S auditing good practice. Do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only: { \"answer\": string, \"clauseRefs\": [{ \"clauseId\": string, \"title\": string }] }.";
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: 900, system, messages: [{ role: 'user', content: body.question }] }),
        });
        if (!aiRes.ok) {
          sendJson(response, 502, { error: 'ai_upstream' }, corsOrigin);
          return;
        }
        const payload = (await aiRes.json()) as { content?: { text?: string }[] };
        const text = (payload.content ?? []).map((part) => part.text ?? '').join('');
        const found = text.match(/\{[\s\S]*\}/);
        const parsed = found ? (JSON.parse(found[0]) as Record<string, unknown>) : null;
        if (!parsed) {
          sendJson(response, 502, { error: 'ai_parse' }, corsOrigin);
          return;
        }
        const refsRaw = Array.isArray(parsed['clauseRefs']) ? (parsed['clauseRefs'] as unknown[]) : [];
        const clauseRefs = refsRaw
          .map((r) => r as { clauseId?: unknown; title?: unknown })
          .filter((r) => typeof r.clauseId === 'string')
          .map((r) => ({ clauseId: String(r.clauseId), title: String(r.title ?? '') }));
        sendJson(response, 200, { answer: String(parsed['answer'] ?? ''), clauseRefs, source: 'ai' }, corsOrigin);
        return;
      } catch {
        sendJson(response, 502, { error: 'ai_failed' }, corsOrigin);
        return;
      }
    }

    // AI finding draft (server-side). Inert until ANTHROPIC_API_KEY + ANTHROPIC_MODEL
    // are set; the client falls back to its offline deterministic composer on any
    // non-2xx. The prompt forbids verbatim ISO requirement text (copyright guardrail).
    const findingDraftMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/finding-draft$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && findingDraftMatch && actor) {
      const tenantId = findingDraftMatch.params['tenantId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const input = await readJson(request, z.object({}).passthrough());
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      const model = process.env['ANTHROPIC_MODEL'];
      if (!apiKey || !model) {
        sendJson(response, 501, { error: 'ai_not_configured' }, corsOrigin);
        return;
      }
      const system =
        'You are an ISO 45001 lead auditor assistant drafting a single audit finding (nonconformity). Use ONLY the finding data provided (clause id/title, note, result, evidence labels) and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text; never use the word "shall". Respond with a strict JSON object only, with keys draftStatement, requirementSummary, objectiveEvidence, suggestedType, gradingRationale, rootCausePrompts. suggestedType must be one of majorNc, minorNc, ofi. rootCausePrompts must be an array of short question strings.';
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model,
            max_tokens: 1200,
            system,
            messages: [{ role: 'user', content: `Finding data:\n${JSON.stringify(input)}` }],
          }),
        });
        if (!aiRes.ok) {
          sendJson(response, 502, { error: 'ai_upstream' }, corsOrigin);
          return;
        }
        const payload = (await aiRes.json()) as { content?: { text?: string }[] };
        const text = (payload.content ?? []).map((part) => part.text ?? '').join('');
        const found = text.match(/\{[\s\S]*\}/);
        const parsed = found ? (JSON.parse(found[0]) as Record<string, unknown>) : null;
        if (!parsed) {
          sendJson(response, 502, { error: 'ai_parse' }, corsOrigin);
          return;
        }
        const types = ['majorNc', 'minorNc', 'ofi'];
        const rawType = parsed['suggestedType'];
        const suggestedType = typeof rawType === 'string' && types.includes(rawType) ? rawType : 'minorNc';
        const rawPrompts = parsed['rootCausePrompts'];
        const rootCausePrompts = Array.isArray(rawPrompts)
          ? rawPrompts.map((p) => String(p)).filter((p) => p.length > 0)
          : [];
        sendJson(
          response,
          200,
          {
            draftStatement: String(parsed['draftStatement'] ?? ''),
            requirementSummary: String(parsed['requirementSummary'] ?? ''),
            objectiveEvidence: String(parsed['objectiveEvidence'] ?? ''),
            suggestedType,
            gradingRationale: String(parsed['gradingRationale'] ?? ''),
            rootCausePrompts,
            source: 'ai',
            generatedAt: new Date().toISOString(),
          },
          corsOrigin,
        );
        return;
      } catch {
        sendJson(response, 502, { error: 'ai_failed' }, corsOrigin);
        return;
      }
    }

    const signoffMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/reports/signoff$`),
      url.pathname,
      ['tenantId', 'auditId'],
    );
    if (request.method === 'POST' && signoffMatch && actor) {
      const tenantId = signoffMatch.params['tenantId']!;
      const auditId = signoffMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor']);
      const command = await readJson(request, signoffCommandSchema);
      const now = new Date().toISOString();
      const reportId = `report-${auditId}`;
      const report = {
        id: reportId,
        tenantId,
        auditId,
        status: 'signed',
        version: 1,
        generatedBy: actor.uid,
        generatedAt: now,
        signedBy: actor.uid,
        signedAt: now,
        pdfStorageRef: `/reports/${reportId}.pdf`,
        attestation: command.attestation,
        contentHash: command.contentHash ?? null,
        hashAlgorithm: command.contentHash ? 'SHA-256' : null,
      };
      await dependencies.db
        .collection(mongoCollections.reports)
        .updateOne({ tenantId, auditId, id: reportId }, { $set: report }, { upsert: true });
      await recordChange(dependencies.db, { tenantId, auditId, actorUid: actor.uid, action: 'sign-off', target: 'report', targetId: reportId });
      sendJson(response, 200, { signedAt: now, report }, corsOrigin);
      return;
    }

    const aspectMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/aspects/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && aspectMatch && actor) {
      const tenantId = aspectMatch.params['tenantId']!;
      const auditId = aspectMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, aspectUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.environmentalAspects)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { aspect: record }, corsOrigin);
      return;
    }

    const obligationMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/obligations/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && obligationMatch && actor) {
      const tenantId = obligationMatch.params['tenantId']!;
      const auditId = obligationMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, obligationUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.complianceObligations)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { obligation: record }, corsOrigin);
      return;
    }

    const emergencyMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/emergency/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && emergencyMatch && actor) {
      const tenantId = emergencyMatch.params['tenantId']!;
      const auditId = emergencyMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, emergencyUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.emergencyRecords)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { emergency: record }, corsOrigin);
      return;
    }

    const interestedPartyMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/interested-parties/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && interestedPartyMatch && actor) {
      const tenantId = interestedPartyMatch.params['tenantId']!;
      const auditId = interestedPartyMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, interestedPartyUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.interestedParties)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { interestedParty: record }, corsOrigin);
      return;
    }

    const objectiveMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/objectives/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && objectiveMatch && actor) {
      const tenantId = objectiveMatch.params['tenantId']!;
      const auditId = objectiveMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, objectiveUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.environmentalObjectives)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { objective: record }, corsOrigin);
      return;
    }

    const communicationMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/communications/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && communicationMatch && actor) {
      const tenantId = communicationMatch.params['tenantId']!;
      const auditId = communicationMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, communicationUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.communicationRecords)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { communication: record }, corsOrigin);
      return;
    }

    // Management review (cl. 9.3) is a leadership/oversight record — lead-only.
    const managementReviewMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/management-reviews/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && managementReviewMatch && actor) {
      const tenantId = managementReviewMatch.params['tenantId']!;
      const auditId = managementReviewMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, managementReviewUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.managementReviews)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { managementReview: record }, corsOrigin);
      return;
    }

    const riskMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/risks-opportunities/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && riskMatch && actor) {
      const tenantId = riskMatch.params['tenantId']!;
      const auditId = riskMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, riskOpportunityUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.risksOpportunities)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { riskOpportunity: record }, corsOrigin);
      return;
    }

    const resourceMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/resources/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && resourceMatch && actor) {
      const tenantId = resourceMatch.params['tenantId']!;
      const auditId = resourceMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, resourceUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.resourceRecords)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { resource: record }, corsOrigin);
      return;
    }

    const competenceMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/competence/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && competenceMatch && actor) {
      const tenantId = competenceMatch.params['tenantId']!;
      const auditId = competenceMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, competenceUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.competenceRecords)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { competence: record }, corsOrigin);
      return;
    }

    const workerMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/people/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && workerMatch && actor) {
      const tenantId = workerMatch.params['tenantId']!;
      const auditId = workerMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, workerUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.workers)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { worker: record }, corsOrigin);
      return;
    }

    const siteMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/sites/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && siteMatch && actor) {
      const tenantId = siteMatch.params['tenantId']!;
      const auditId = siteMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, siteUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.sites)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { site: record }, corsOrigin);
      return;
    }

    const awarenessMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/awareness/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && awarenessMatch && actor) {
      const tenantId = awarenessMatch.params['tenantId']!;
      const auditId = awarenessMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, awarenessUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.awarenessRecords)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { awareness: record }, corsOrigin);
      return;
    }

    const documentedInfoMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/documented-info/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && documentedInfoMatch && actor) {
      const tenantId = documentedInfoMatch.params['tenantId']!;
      const auditId = documentedInfoMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, documentedInfoUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.documentedInfo)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { documentedInfo: record }, corsOrigin);
      return;
    }

    const performanceMetricMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/performance-metrics/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && performanceMetricMatch && actor) {
      const tenantId = performanceMetricMatch.params['tenantId']!;
      const auditId = performanceMetricMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, performanceMetricUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.performanceMetrics)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { performanceMetric: record }, corsOrigin);
      return;
    }

    const permitMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/permits/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && permitMatch && actor) {
      const tenantId = permitMatch.params['tenantId']!;
      const auditId = permitMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, permitUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.permits)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { permit: record }, corsOrigin);
      return;
    }

    const incidentMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/incidents/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && incidentMatch && actor) {
      const tenantId = incidentMatch.params['tenantId']!;
      const auditId = incidentMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, incidentUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.incidents)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { incident: record }, corsOrigin);
      return;
    }

    const hiraMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/hira/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && hiraMatch && actor) {
      const tenantId = hiraMatch.params['tenantId']!;
      const auditId = hiraMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, hiraUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.hira)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { hira: record }, corsOrigin);
      return;
    }

    const calibrationMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/calibration/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && calibrationMatch && actor) {
      const tenantId = calibrationMatch.params['tenantId']!;
      const auditId = calibrationMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, calibrationUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.calibration)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { calibration: record }, corsOrigin);
      return;
    }

    const trainingMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/training/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && trainingMatch && actor) {
      const tenantId = trainingMatch.params['tenantId']!;
      const auditId = trainingMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, trainingUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.training)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { training: record }, corsOrigin);
      return;
    }

    const supplierMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/suppliers/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && supplierMatch && actor) {
      const tenantId = supplierMatch.params['tenantId']!;
      const auditId = supplierMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, supplierUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.suppliers)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { supplier: record }, corsOrigin);
      return;
    }

    const changeMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/changes/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && changeMatch && actor) {
      const tenantId = changeMatch.params['tenantId']!;
      const auditId = changeMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, changeUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.changes)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { change: record }, corsOrigin);
      return;
    }

    const operationalControlMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/operational-controls/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && operationalControlMatch && actor) {
      const tenantId = operationalControlMatch.params['tenantId']!;
      const auditId = operationalControlMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, operationalControlUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.operationalControls)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { operationalControl: record }, corsOrigin);
      return;
    }

    const consultationMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/audits/${auditPath}/worker-consultations/([^/]+)$`),
      url.pathname,
      ['tenantId', 'auditId', 'id'],
    );
    if (request.method === 'PUT' && consultationMatch && actor) {
      const tenantId = consultationMatch.params['tenantId']!;
      const auditId = consultationMatch.params['auditId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['leadAuditor', 'auditor']);
      const command = await readJson(request, workerConsultationUpsertCommandSchema);
      const record = { ...command, tenantId, auditId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.workerConsultations)
        .updateOne({ tenantId, auditId, id: command.id }, { $set: record }, { upsert: true });
      sendJson(response, 200, { workerConsultation: record }, corsOrigin);
      return;
    }

    const programmeMatch = matchPath(
      new RegExp(`^/api/tenants/${tenantPath}/programme$`),
      url.pathname,
      ['tenantId'],
    );
    if (request.method === 'GET' && programmeMatch && actor) {
      const tenantId = programmeMatch.params['tenantId']!;
      requireTenant(actor, tenantId);
      const doc = await dependencies.db
        .collection(mongoCollections.auditProgrammes)
        .findOne({ tenantId }, { projection: { _id: 0 } });
      sendJson(response, 200, doc ?? null, corsOrigin);
      return;
    }
    if (request.method === 'PUT' && programmeMatch && actor) {
      const tenantId = programmeMatch.params['tenantId']!;
      requireTenant(actor, tenantId);
      requireAnyRole(actor, ['tenantAdmin', 'leadAuditor']);
      const command = await readJson(request, programmeUpsertSchema);
      const record = { ...command, tenantId, updatedAt: new Date().toISOString() };
      await dependencies.db
        .collection(mongoCollections.auditProgrammes)
        .updateOne({ tenantId }, { $set: record }, { upsert: true });
      sendJson(response, 200, { programme: record }, corsOrigin);
      return;
    }

    sendJson(response, 404, { error: 'Route not found.' }, corsOrigin);
  } catch (error) {
    sendError(response, error, corsOrigin);
  }
}
