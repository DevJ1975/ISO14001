import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import type { Db } from 'mongodb';

import { loadServerConfig } from '../server/config';
import { hashPassword } from '../server/password';
import { handleApiRequest } from '../server/routes';

const config = loadServerConfig({ MONGODB_URI: 'mongodb://localhost:27017', ALLOW_DEV_AUTH_HEADERS: 'true' });

function leadHeaders(tenantId = 't'): Record<string, string> {
  return { 'x-iso-actor-uid': 'uid-lead', 'x-iso-tenant-id': tenantId, 'x-iso-role': 'leadAuditor', 'x-iso-platform': 'false' };
}

function makeReq(opts: { method: string; url: string; headers?: Record<string, string>; body?: unknown }): IncomingMessage {
  const iterator = (async function* () {
    if (opts.body !== undefined) yield Buffer.from(JSON.stringify(opts.body));
  })();
  const req: Record<string, unknown> = {
    method: opts.method,
    url: opts.url,
    headers: opts.headers ?? {},
    socket: { remoteAddress: '203.0.113.7' },
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
    Object.keys(query).every((key) => {
      if (key.includes('.')) {
        const val = key.split('.').reduce<unknown>((v, p) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[p] : undefined), doc);
        return val === query[key];
      }
      return doc[key] === query[key];
    });
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
        if (update['$setOnInsert']) for (const k of Object.keys(update['$setOnInsert'])) if (!(k in doc)) doc[k] = update['$setOnInsert'][k];
      },
    };
  };
  return { db: { collection } as unknown as Db, store };
}

describe('login rate limiting', () => {
  it('returns 429 after repeated failures for the same email + IP', async () => {
    const { db, store } = createFakeDb();
    store.set('members', [
      {
        uid: 'u1', tenantId: 't', role: 'leadAuditor', status: 'active',
        profile: { email: 'lead@example.test', displayName: 'Lead' },
        passwordHash: hashPassword('correct-horse'),
      },
    ]);
    const attempt = async () => {
      const res = makeRes();
      await handleApiRequest(
        makeReq({ method: 'POST', url: '/api/auth/login', headers: { 'x-forwarded-for': '198.51.100.9' }, body: { email: 'lead@example.test', password: 'wrong' } }),
        res,
        { db, config },
      );
      return res.statusCode;
    };
    // 5 allowed failures (401), then throttled (429).
    for (let i = 0; i < 5; i++) assert.equal(await attempt(), 401);
    assert.equal(await attempt(), 429);
  });
});

describe('change-log audit trail', () => {
  it('records sign-off and surfaces it in field-state', async () => {
    const { db } = createFakeDb();
    const A = '/api/tenants/t/audits/a';
    const signed = makeRes();
    await handleApiRequest(
      makeReq({ method: 'POST', url: `${A}/reports/signoff`, headers: leadHeaders(), body: { attestation: 'I attest this audit met ISO 19011.' } }),
      signed,
      { db, config },
    );
    assert.equal(signed.statusCode, 200);

    const state = makeRes();
    await handleApiRequest(makeReq({ method: 'GET', url: `${A}/field-state`, headers: leadHeaders() }), state, { db, config });
    const payload = JSON.parse(state.body) as { changeLog: Array<{ action: string; target: string; actorUid: string }> };
    const signoff = payload.changeLog.find((e) => e.action === 'sign-off');
    assert.ok(signoff, 'expected a sign-off change-log entry');
    assert.equal(signoff?.target, 'report');
    assert.equal(signoff?.actorUid, 'uid-lead');
  });
});
