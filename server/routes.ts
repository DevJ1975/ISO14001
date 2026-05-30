import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

import { Db } from 'mongodb';
import { z, ZodError, ZodType } from 'zod';

import {
  backendJobSchema,
  buildEvidenceMetadataPath,
  buildPhotoEvidenceStorageRef,
  capaReminderScheduleCommandSchema,
  evidenceUploadIntentCommandSchema,
  evidenceUploadIntentSchema,
  memberClaimsAssignmentCommandSchema,
  photoAnalysisRequestCommandSchema,
  reportPdfGenerationCommandSchema,
  tenantMemberInviteCommandSchema,
  tenantOnboardingCommandSchema,
} from '../src/app/core/domain/index.js';
import { ApiAuthError, authenticateRequest, requireAnyRole, requireTenant } from './auth.js';
import { mongoCollections } from './collections.js';
import { ServerConfig } from './config.js';

export interface RouteDependencies {
  readonly db: Db;
  readonly config: ServerConfig;
}

type RouteParams = Record<string, string>;

interface RouteMatch {
  readonly params: RouteParams;
  readonly pattern: RegExp;
}

const jsonContentType = { 'content-type': 'application/json; charset=utf-8' };

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

  if (error instanceof ZodError) {
    sendJson(response, 400, { error: 'Invalid request body.', issues: error.issues }, corsOrigin);
    return;
  }

  sendJson(response, 500, { error: 'Unexpected backend error.' }, corsOrigin);
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
      question: 'What internal and external EMS context changes should the team verify during this audit?',
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
    const actor = request.method === 'GET' && url.pathname === '/api/health'
      ? null
      : authenticateRequest(request, dependencies.config);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      await dependencies.db.command({ ping: 1 });
      sendJson(response, 200, { ok: true, backend: 'mongodb', database: dependencies.db.databaseName }, corsOrigin);
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
      const [items, evidence, findings] = await Promise.all([
        ensureChecklist(dependencies.db, tenantId, auditId),
        evidenceCollection.find({ tenantId, auditId }, { projection: { _id: 0 } }).sort({ capturedAt: -1 }).toArray(),
        findingsCollection.find({ tenantId, auditId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
      ]);
      sendJson(response, 200, { items, evidence, findings }, corsOrigin);
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

    sendJson(response, 404, { error: 'Route not found.' }, corsOrigin);
  } catch (error) {
    sendError(response, error, corsOrigin);
  }
}
