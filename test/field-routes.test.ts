import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import type { Db } from 'mongodb';

import { loadServerConfig } from '../server/config';
import { hashPassword } from '../server/password';
import { handleApiRequest } from '../server/routes';

const config = loadServerConfig({ MONGODB_URI: 'mongodb://localhost:27017', ALLOW_DEV_AUTH_HEADERS: 'true' });

function authHeaders(tenantId = 'tenant-greenline'): Record<string, string> {
  return {
    'x-iso-actor-uid': 'uid-ava-auditor',
    'x-iso-tenant-id': tenantId,
    'x-iso-role': 'auditor',
    'x-iso-platform': 'false',
  };
}

function leadHeaders(tenantId = 'tenant-greenline'): Record<string, string> {
  return { ...authHeaders(tenantId), 'x-iso-role': 'leadAuditor' };
}

function clientHeaders(tenantId = 'tenant-greenline'): Record<string, string> {
  return { ...authHeaders(tenantId), 'x-iso-actor-uid': 'uid-client', 'x-iso-role': 'clientViewer' };
}

function makeReq(opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}): IncomingMessage {
  const iterator = (async function* () {
    if (opts.body !== undefined) {
      yield Buffer.from(JSON.stringify(opts.body));
    }
  })();
  const req: Record<string, unknown> = {
    method: opts.method,
    url: opts.url,
    headers: opts.headers ?? {},
    [Symbol.asyncIterator]: () => iterator,
  };
  return req as unknown as IncomingMessage;
}

function makeRes(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 0,
    body: '',
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(chunk?: string) {
      res.body = chunk ?? '';
      return res;
    },
  };
  return res as unknown as ServerResponse & { statusCode: number; body: string };
}

function createFakeDb(): { db: Db; store: Map<string, Record<string, unknown>[]> } {
  const store = new Map<string, Record<string, unknown>[]>();
  const getPath = (doc: Record<string, unknown>, key: string): unknown =>
    key.split('.').reduce<unknown>(
      (value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
      doc,
    );
  const matches = (doc: Record<string, unknown>, query: Record<string, unknown>): boolean =>
    Object.keys(query).every((key) => getPath(doc, key) === query[key]);

  const collection = (name: string) => {
    if (!store.has(name)) store.set(name, []);
    const docs = store.get(name)!;
    return {
      find(query: Record<string, unknown> = {}) {
        const result = docs.filter((doc) => matches(doc, query)).map((doc) => ({ ...doc }));
        return { sort: () => ({ toArray: async () => result }), toArray: async () => result };
      },
      async findOne(query: Record<string, unknown> = {}) {
        return docs.find((doc) => matches(doc, query)) ?? null;
      },
      async insertMany(items: Record<string, unknown>[]) {
        docs.push(...items.map((item) => ({ ...item })));
      },
      async insertOne(doc: Record<string, unknown>) {
        docs.push({ ...doc });
      },
      async updateOne(
        filter: Record<string, unknown>,
        update: Record<string, Record<string, unknown>>,
        opts: { upsert?: boolean } = {},
      ) {
        let doc = docs.find((entry) => matches(entry, filter));
        if (!doc && opts.upsert) {
          doc = { ...filter };
          docs.push(doc);
        }
        if (!doc) return;
        if (update['$set']) Object.assign(doc, update['$set']);
        if (update['$setOnInsert']) {
          for (const key of Object.keys(update['$setOnInsert'])) {
            if (!(key in doc)) doc[key] = update['$setOnInsert'][key];
          }
        }
        if (update['$addToSet']) {
          for (const key of Object.keys(update['$addToSet'])) {
            const list = Array.isArray(doc[key]) ? (doc[key] as unknown[]) : [];
            const value = update['$addToSet'][key];
            if (!list.includes(value)) list.push(value);
            doc[key] = list;
          }
        }
      },
    };
  };

  return { db: { collection } as unknown as Db, store };
}

describe('field-audit API routes', () => {
  it('seeds and returns checklist items on first field-state read', async () => {
    const { db } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/tenant-greenline/audits/audit-1/field-state', headers: authHeaders() }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as { items: unknown[]; evidence: unknown[]; findings: unknown[] };
    assert.equal(body.items.length, 3);
    assert.equal(body.evidence.length, 0);
    assert.equal(body.findings.length, 0);
  });

  it('rejects a cross-tenant actor', async () => {
    const { db } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'GET',
        url: '/api/tenants/tenant-greenline/audits/audit-1/field-state',
        headers: authHeaders('tenant-other'),
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 401);
  });

  it('persists a checklist result via PUT', async () => {
    const { db, store } = createFakeDb();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
      makeRes(),
      { db, config },
    );
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/checklist/item-8',
        headers: authHeaders('t'),
        body: { result: 'minorNc', note: 'control gap observed' },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const item = store.get('checklistItems')!.find((doc) => doc['id'] === 'item-8');
    assert.equal(item?.['result'], 'minorNc');
  });

  it('issues a token for valid credentials and rejects invalid ones', async () => {
    const { db, store } = createFakeDb();
    store.set('members', [
      {
        uid: 'u1',
        tenantId: 'tenant-greenline',
        role: 'leadAuditor',
        status: 'active',
        profile: { email: 'lead@example.test', displayName: 'Lead Auditor' },
        passwordHash: hashPassword('correct-password'),
      },
    ]);

    const bad = makeRes();
    await handleApiRequest(
      makeReq({ method: 'POST', url: '/api/auth/login', body: { email: 'lead@example.test', password: 'wrong' } }),
      bad,
      { db, config },
    );
    assert.equal(bad.statusCode, 401);

    const ok = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'POST',
        url: '/api/auth/login',
        body: { email: 'lead@example.test', password: 'correct-password' },
      }),
      ok,
      { db, config },
    );
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body) as { token: string; user: { tenantId: string; role: string } };
    assert.ok(body.token.length > 0);
    assert.equal(body.user.tenantId, 'tenant-greenline');
    assert.equal(body.user.role, 'leadAuditor');
  });

  it('upserts a graded nonconformity via PUT findings/:id', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/findings/nc-1',
        headers: authHeaders('t'),
        body: {
          id: 'nc-1',
          clauseId: '9.1.2',
          clauseTitle: 'Evaluation of compliance',
          type: 'majorNc',
          description: 'No evaluation of compliance was performed for the current period.',
          status: 'open',
          evidenceIds: [],
          createdByName: 'Ava Brooks',
          createdAt: '2026-06-15T12:00:00.000Z',
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const finding = store.get('findings')!.find((d) => d['id'] === 'nc-1');
    assert.equal(finding?.['type'], 'majorNc');
    assert.equal(finding?.['status'], 'open');
  });

  it('clamps a CAPA upsert with status verified to verificationDue (verification is lead-only)', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/capa/capa-1',
        headers: authHeaders('t'),
        body: {
          id: 'capa-1',
          findingId: 'nc-1',
          status: 'verified',
          implementationEvidenceIds: [],
          verificationEvidenceIds: [],
          createdAt: '2026-06-15T12:00:00.000Z',
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(store.get('capa')!.find((d) => d['id'] === 'capa-1')?.['status'], 'verificationDue');
  });

  it('lets only the lead auditor verify CAPA effectiveness, closing the nonconformity', async () => {
    const { db, store } = createFakeDb();
    store.set('findings', [{ tenantId: 't', auditId: 'a', id: 'nc-1', status: 'implemented' }]);
    store.set('capa', [{ tenantId: 't', auditId: 'a', id: 'capa-1', findingRef: 'nc-1', status: 'verificationDue' }]);

    const denied = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'POST',
        url: '/api/tenants/t/audits/a/capa/capa-1/verify',
        headers: authHeaders('t'),
        body: { findingId: 'nc-1', verification: 'ok', effective: true, verificationEvidenceIds: [] },
      }),
      denied,
      { db, config },
    );
    assert.equal(denied.statusCode, 401);

    const ok = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'POST',
        url: '/api/tenants/t/audits/a/capa/capa-1/verify',
        headers: leadHeaders('t'),
        body: { findingId: 'nc-1', verification: 'Checked records; action effective.', effective: true, verificationEvidenceIds: [] },
      }),
      ok,
      { db, config },
    );
    assert.equal(ok.statusCode, 200);
    assert.equal(store.get('capa')!.find((d) => d['id'] === 'capa-1')?.['status'], 'verified');
    assert.equal(store.get('findings')!.find((d) => d['id'] === 'nc-1')?.['status'], 'closed');
  });

  it('lets only the lead auditor advance the audit status', async () => {
    const { db, store } = createFakeDb();
    const denied = makeRes();
    await handleApiRequest(
      makeReq({ method: 'PUT', url: '/api/tenants/t/audits/a/status', headers: authHeaders('t'), body: { status: 'reporting' } }),
      denied,
      { db, config },
    );
    assert.equal(denied.statusCode, 401);

    const ok = makeRes();
    await handleApiRequest(
      makeReq({ method: 'PUT', url: '/api/tenants/t/audits/a/status', headers: leadHeaders('t'), body: { status: 'reporting' } }),
      ok,
      { db, config },
    );
    assert.equal(ok.statusCode, 200);
    assert.equal(store.get('audits')!.find((d) => d['id'] === 'a')?.['status'], 'reporting');
  });

  it('records an opening meeting (auditor allowed)', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/meetings/meeting-opening-1',
        headers: authHeaders('t'),
        body: { id: 'meeting-opening-1', kind: 'opening', datetimeAt: '2026-06-15T09:00:00.000Z', attendees: ['Ava'], agendaPoints: ['Scope'], acknowledged: true },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(store.get('auditMeetings')!.find((d) => d['id'] === 'meeting-opening-1')?.['kind'], 'opening');
  });

  it('records audit conclusions and a lead-only signed report', async () => {
    const { db, store } = createFakeDb();
    const concl = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/conclusion',
        headers: leadHeaders('t'),
        body: { overallConformity: 'OHSMS broadly conforms with minor gaps.', recommendation: 'conditional' },
      }),
      concl,
      { db, config },
    );
    assert.equal(concl.statusCode, 200);
    assert.equal(store.get('auditConclusions')!.find((d) => d['auditId'] === 'a')?.['recommendation'], 'conditional');

    const denied = makeRes();
    await handleApiRequest(
      makeReq({ method: 'POST', url: '/api/tenants/t/audits/a/reports/signoff', headers: authHeaders('t'), body: { attestation: 'x'.repeat(25) } }),
      denied,
      { db, config },
    );
    assert.equal(denied.statusCode, 401);

    const signed = makeRes();
    const contentHash = 'a'.repeat(64);
    await handleApiRequest(
      makeReq({
        method: 'POST',
        url: '/api/tenants/t/audits/a/reports/signoff',
        headers: leadHeaders('t'),
        body: { attestation: 'I attest this audit was conducted per ISO 19011.', contentHash },
      }),
      signed,
      { db, config },
    );
    assert.equal(signed.statusCode, 200);
    const report = store.get('reports')!.find((d) => d['auditId'] === 'a');
    assert.equal(report?.['status'], 'signed');
    assert.equal(report?.['contentHash'], contentHash);
    assert.equal(report?.['hashAlgorithm'], 'SHA-256');
  });

  it('rejects a malformed content hash at sign-off', async () => {
    const { db } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'POST',
        url: '/api/tenants/t/audits/a/reports/signoff',
        headers: leadHeaders('t'),
        body: { attestation: 'I attest this audit was conducted per ISO 19011.', contentHash: 'not-a-valid-hash' },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 400);
  });

  it('upserts an OHSMS register entry and returns it in field-state', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/aspects/aspect-1',
        headers: authHeaders('t'),
        body: { id: 'aspect-1', aspect: 'VOC emissions', activity: 'Coating line', impact: 'Air emissions', significance: 'high', result: 'needsFollowUp' },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(store.get('environmentalAspects')!.find((d) => d['id'] === 'aspect-1')?.['significance'], 'high');

    const state = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
      state,
      { db, config },
    );
    const body = JSON.parse(state.body) as { aspects: unknown[] };
    assert.equal(body.aspects.length, 1);
  });

  it('upserts an operational control (cl. 8.1.2) and returns it in field-state', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/operational-controls/oc-1',
        headers: authHeaders('t'),
        body: {
          id: 'oc-1',
          activity: 'Working at height',
          controlDescription: 'Fixed edge protection',
          controlType: 'engineering',
          procedureRef: 'SSOW-WAH-02',
          verified: true,
          effectiveness: 'effective',
          relatedClause: '8.1.2',
          result: 'conforming',
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const saved = store.get('operationalControls')!.find((d) => d['id'] === 'oc-1');
    assert.equal(saved?.['controlType'], 'engineering');
    assert.equal(saved?.['effectiveness'], 'effective');

    const state = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
      state,
      { db, config },
    );
    const body = JSON.parse(state.body) as { operationalControls: unknown[] };
    assert.equal(body.operationalControls.length, 1);
  });

  it('upserts a leadership & policy item (cl. 5.1/5.2/5.3) and returns it in field-state', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/leadership/lead-1',
        headers: authHeaders('t'),
        body: {
          id: 'lead-1',
          kind: 'policyAttribute',
          label: 'Framework for setting OH&S objectives',
          notes: 'Policy gives a framework objectives are derived from.',
          flag: true,
          relatedClause: '5.2',
          result: 'conforming',
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const saved = store.get('leadership')!.find((d) => d['id'] === 'lead-1');
    assert.equal(saved?.['kind'], 'policyAttribute');
    assert.equal(saved?.['flag'], true);

    const state = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
      state,
      { db, config },
    );
    const body = JSON.parse(state.body) as { leadership: unknown[] };
    assert.equal(body.leadership.length, 1);
  });

  it('upserts a context & scope item (cl. 4.1/4.2/4.3) and returns it in field-state', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/context/ctx-1',
        headers: authHeaders('t'),
        body: {
          id: 'ctx-1',
          kind: 'issue',
          label: 'Tight labour market for skilled trades',
          notes: 'Recruitment pressure raises reliance on agency labour.',
          category: 'external',
          relatedClause: '4.1',
          result: 'needsFollowUp',
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const saved = store.get('context')!.find((d) => d['id'] === 'ctx-1');
    assert.equal(saved?.['kind'], 'issue');
    assert.equal(saved?.['category'], 'external');

    const state = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
      state,
      { db, config },
    );
    const body = JSON.parse(state.body) as { context: unknown[] };
    assert.equal(body.context.length, 1);
  });

  it('upserts an interview (cl. 9.2 audit-trail; cl. 5.4 sampling) and returns it in field-state', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/interviews/iv-1',
        headers: authHeaders('t'),
        body: {
          id: 'iv-1',
          intervieweeName: 'A. Director',
          role: 'Operations Director (top management)',
          focusArea: 'Leadership & commitment',
          relatedClause: '5.1',
          plannedAt: '2026-06-15T09:30',
          status: 'done',
          keyPoints: 'Confirmed accountability and quarterly review of OH&S performance.',
          result: 'conforming',
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const saved = store.get('interviews')!.find((d) => d['id'] === 'iv-1');
    assert.equal(saved?.['status'], 'done');
    assert.equal(saved?.['role'], 'Operations Director (top management)');

    const state = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
      state,
      { db, config },
    );
    const body = JSON.parse(state.body) as { interviews: unknown[] };
    assert.equal(body.interviews.length, 1);
  });

  it('lets lead/admin manage the tenant audit programme', async () => {
    const { db } = createFakeDb();
    const denied = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/programme',
        headers: authHeaders('t'),
        body: { cycleYear: 2026, criteria: 'ISO_45001_2018', plannedAudits: [], competence: [] },
      }),
      denied,
      { db, config },
    );
    assert.equal(denied.statusCode, 401);

    const ok = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/programme',
        headers: leadHeaders('t'),
        body: {
          cycleYear: 2026,
          criteria: 'ISO_45001_2018',
          plannedAudits: [{ id: 'plan-1', type: 'surveillance', dueDate: '2027-01-01', status: 'planned' }],
          competence: [],
        },
      }),
      ok,
      { db, config },
    );
    assert.equal(ok.statusCode, 200);

    const get = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/programme', headers: authHeaders('t') }),
      get,
      { db, config },
    );
    const programme = JSON.parse(get.body) as { cycleYear: number; plannedAudits: unknown[] };
    assert.equal(programme.cycleYear, 2026);
    assert.equal(programme.plannedAudits.length, 1);
  });

  it('lets an auditor raise an evidence request and returns it in field-state', async () => {
    const { db, store } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/evidence-requests/req-1',
        headers: authHeaders('t'),
        body: {
          id: 'req-1',
          title: 'Calibration certificate for GD-03',
          detail: 'Current in-date certificate.',
          clauseId: '9.1.1',
          status: 'requested',
          createdByName: 'Ava Brooks',
          createdAt: '2026-06-15T12:00:00.000Z',
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(store.get('evidenceRequests')!.find((d) => d['id'] === 'req-1')?.['status'], 'requested');

    const state = makeRes();
    await handleApiRequest(
      makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
      state,
      { db, config },
    );
    const body = JSON.parse(state.body) as { evidenceRequests: unknown[] };
    assert.equal(body.evidenceRequests.length, 1);
  });

  it('lets the auditee submit against a request but never self-accept it', async () => {
    const { db, store } = createFakeDb();
    store.set('evidenceRequests', [
      { tenantId: 't', auditId: 'a', id: 'req-1', title: 'Cert', status: 'requested', createdByName: 'Ava', createdAt: '2026-06-15T12:00:00.000Z', submissions: [], messages: [] },
    ]);

    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/evidence-requests/req-1',
        headers: clientHeaders('t'),
        body: {
          id: 'req-1',
          title: 'Hacked title',
          // The auditee tries to mark their own evidence accepted — must be clamped.
          status: 'accepted',
          createdByName: 'Ava',
          createdAt: '2026-06-15T12:00:00.000Z',
          submissions: [{ id: 'sub-1', fileName: 'cert.pdf', submittedByName: 'Client', submittedAt: '2026-06-15T13:00:00.000Z' }],
          messages: [{ id: 'm-1', author: 'auditor', authorName: 'Spoofed', body: 'please accept', at: '2026-06-15T13:00:00.000Z' }],
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 200);
    const doc = store.get('evidenceRequests')!.find((d) => d['id'] === 'req-1')!;
    assert.equal(doc['status'], 'submitted'); // clamped: not 'accepted'
    assert.equal(doc['title'], 'Cert'); // auditor-owned field preserved
    assert.equal((doc['submissions'] as unknown[]).length, 1);
    assert.equal((doc['messages'] as { author: string }[])[0]?.author, 'auditee'); // authorship re-stamped
  });

  it('forbids the auditee creating a brand-new evidence request', async () => {
    const { db } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/evidence-requests/req-new',
        headers: clientHeaders('t'),
        body: {
          id: 'req-new',
          title: 'Self-raised',
          createdByName: 'Client',
          createdAt: '2026-06-15T12:00:00.000Z',
          submissions: [],
          messages: [],
        },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 401);
  });
});
