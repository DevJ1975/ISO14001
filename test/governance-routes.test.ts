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
      const key = path === 'interested-parties' ? 'interestedParties' : path === 'management-reviews' ? 'managementReviews' : path;
      assert.equal(payload[key]!.length, 1);
    });
  }

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
