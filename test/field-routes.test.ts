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
});
