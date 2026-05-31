import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import type { Db } from 'mongodb';

import { loadServerConfig } from '../server/config';
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

function makeReq(opts: { method: string; url: string; headers?: Record<string, string>; body?: unknown }): IncomingMessage {
  const iterator = (async function* () {
    if (opts.body !== undefined) yield Buffer.from(JSON.stringify(opts.body));
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
  const matches = (doc: Record<string, unknown>, query: Record<string, unknown>): boolean =>
    Object.keys(query).every((key) => doc[key] === query[key]);
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
      async updateOne(filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>, opts: { upsert?: boolean } = {}) {
        let doc = docs.find((entry) => matches(entry, filter));
        if (!doc && opts.upsert) {
          doc = { ...filter };
          docs.push(doc);
        }
        if (!doc) return;
        if (update['$set']) Object.assign(doc, update['$set']);
        if (update['$setOnInsert']) {
          for (const key of Object.keys(update['$setOnInsert'])) if (!(key in doc)) doc[key] = update['$setOnInsert'][key];
        }
      },
    };
  };
  return { db: { collection } as unknown as Db, store };
}

describe('EMS governance API routes', () => {
  const cases = [
    { path: 'interested-parties', collection: 'interestedParties', body: { id: 'party-1', party: 'Regulator', category: 'external', result: 'conforming' }, check: 'party' },
    { path: 'objectives', collection: 'environmentalObjectives', body: { id: 'obj-1', objective: 'Cut VOCs', progress: 'onTrack', result: 'needsFollowUp' }, check: 'objective' },
    { path: 'communications', collection: 'communicationRecords', body: { id: 'comm-1', topic: 'Policy', direction: 'internal', result: 'conforming' }, check: 'topic' },
    { path: 'management-reviews', collection: 'managementReviews', body: { id: 'review-1', inputs: 'audit results', decisions: 'reinstate evaluation', result: 'needsFollowUp' }, check: 'inputs' },
    { path: 'risks-opportunities', collection: 'risksOpportunities', body: { id: 'risk-1', description: 'Permit limit risk', kind: 'risk', significance: 'high', result: 'needsFollowUp' }, check: 'description' },
    { path: 'resources', collection: 'resourceRecords', body: { id: 'res-1', resource: 'EHS team', category: 'people', adequacy: 'partial', result: 'needsFollowUp' }, check: 'resource' },
    { path: 'competence', collection: 'competenceRecords', body: { id: 'comp-1', role: 'Operators', status: 'competent', result: 'conforming' }, check: 'role' },
    { path: 'awareness', collection: 'awarenessRecords', body: { id: 'aware-1', topic: 'Policy', audience: 'All staff', result: 'conforming' }, check: 'topic' },
    { path: 'documented-info', collection: 'documentedInfo', body: { id: 'doc-1', document: 'EMS Manual', controlStatus: 'controlled', version: 'v3.0', owner: 'EHS Manager', lastReviewedAt: '2025-10-01', nextReviewAt: '2026-10-01', reviewFrequencyMonths: 12, attachments: [{ id: 'att-1', name: 'manual.pdf', mime: 'application/pdf', size: 1024, blobKey: 'att-1', addedAt: '2026-01-01T00:00:00.000Z' }], result: 'conforming' }, check: 'document' },
    { path: 'performance-metrics', collection: 'performanceMetrics', body: { id: 'metric-1', indicator: 'Electricity', category: 'energy', unit: 'MWh', targetValue: 1200, actualValue: 1185, trend: 'improving', result: 'conforming' }, check: 'indicator' },
    { path: 'permits', collection: 'permits', body: { id: 'permit-1', title: 'Environmental permit', permitType: 'permit', reference: 'EPR/AB1234CD', expiresAt: '2027-09-30', renewalReminderDays: 90, complianceStatus: 'compliant', result: 'conforming' }, check: 'title' },
    { path: 'incidents', collection: 'incidents', body: { id: 'inc-1', title: 'Oil spill', incidentType: 'spill', severity: 'high', status: 'investigating', reportableToRegulator: false, result: 'needsFollowUp' }, check: 'title' },
    { path: 'calibration', collection: 'calibration', body: { id: 'cal-1', equipment: 'pH meter', identifier: 'PH-11', parameter: 'pH', nextDueAt: '2026-12-01', frequencyMonths: 6, result: 'conforming' }, check: 'equipment' },
    { path: 'training', collection: 'training', body: { id: 'trn-1', person: 'M. Silva', role: 'Operator', course: 'Spill response', completedAt: '2025-07-01', expiresAt: '2026-07-01', frequencyMonths: 12, mandatory: true, result: 'needsFollowUp' }, check: 'person' },
    { path: 'suppliers', collection: 'suppliers', body: { id: 'sup-1', name: 'GreenWaste Carriers Ltd', serviceType: 'Hazardous waste collection', category: 'wasteCarrier', environmentallyRelevant: true, controlsCommunicated: true, rating: 'approved', lastEvaluatedAt: '2026-01-10', nextEvaluationAt: '2027-01-10', evaluationFrequencyMonths: 12, result: 'conforming' }, check: 'name' },
    { path: 'changes', collection: 'changes', body: { id: 'moc-1', title: 'Switch to water-based degreaser', description: 'Material substitution', changeType: 'material', status: 'implemented', aspectsReviewed: false, riskLevel: 'high', owner: 'EHS Lead', implementedAt: '2026-05-20', result: 'nonconforming' }, check: 'title' },
    { path: 'carbon', collection: 'carbon', body: { id: 'co2-1', source: 'Natural gas — boilers', scope: 1, category: 'Stationary combustion', period: 'FY2025', activityData: 4200, activityUnit: 'MWh', emissionFactor: 183, result: 'conforming' }, check: 'source' },
  ];

  for (const { path, collection, body, check } of cases) {
    it(`upserts a ${path} record and returns it in field-state`, async () => {
      const { db, store } = createFakeDb();
      const put = makeRes();
      await handleApiRequest(
        makeReq({ method: 'PUT', url: `/api/tenants/t/audits/a/${path}/${body.id}`, headers: authHeaders('t'), body }),
        put,
        { db, config },
      );
      assert.equal(put.statusCode, 200);
      const saved = store.get(collection)!.find((d) => d['id'] === body.id);
      assert.ok(saved, `expected ${collection} to hold the record`);
      assert.equal(saved?.[check], (body as Record<string, unknown>)[check]);

      const state = makeRes();
      await handleApiRequest(
        makeReq({ method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: authHeaders('t') }),
        state,
        { db, config },
      );
      const payload = JSON.parse(state.body) as Record<string, unknown[]>;
      const keyMap: Record<string, string> = {
        'interested-parties': 'interestedParties',
        'management-reviews': 'managementReviews',
        'risks-opportunities': 'risksOpportunities',
        'documented-info': 'documentedInfo',
        'performance-metrics': 'performanceMetrics',
      };
      const key = keyMap[path] ?? path;
      assert.equal(payload[key]!.length, 1);
    });
  }

  it('persists certificates, complaints and planning on the audit programme', async () => {
    const { db, store } = createFakeDb();
    const leadHeaders = { ...authHeaders('t'), 'x-iso-role': 'leadAuditor' };
    const body = {
      cycleYear: 2026,
      criteria: 'ISO_14001_2026',
      plannedAudits: [],
      competence: [],
      certificates: [
        { id: 'cert-1', certificateNumber: 'EMS-0007', scopeStatement: 'Assembly', status: 'active', history: [{ action: 'issued', at: '2026-01-01' }] },
      ],
      complaintsAppeals: [{ id: 'case-1', kind: 'complaint', subject: 'Noise', status: 'received' }],
      planning: { effectivePersonnel: 50, complexity: 'high', siteCount: 9, stage: 'initial' },
    };
    const put = makeRes();
    await handleApiRequest(makeReq({ method: 'PUT', url: '/api/tenants/t/programme', headers: leadHeaders, body }), put, { db, config });
    assert.equal(put.statusCode, 200);

    const saved = store.get('auditProgrammes')!.find((d) => d['tenantId'] === 't')!;
    assert.equal((saved['certificates'] as unknown[]).length, 1);
    assert.equal((saved['complaintsAppeals'] as unknown[]).length, 1);
    assert.equal((saved['planning'] as Record<string, unknown>)['effectivePersonnel'], 50);
  });

  it('rejects an unknown register result with 400', async () => {
    const { db } = createFakeDb();
    const res = makeRes();
    await handleApiRequest(
      makeReq({
        method: 'PUT',
        url: '/api/tenants/t/audits/a/objectives/obj-bad',
        headers: authHeaders('t'),
        body: { id: 'obj-bad', objective: 'x', result: 'totally-invalid' },
      }),
      res,
      { db, config },
    );
    assert.equal(res.statusCode, 400);
  });
});
