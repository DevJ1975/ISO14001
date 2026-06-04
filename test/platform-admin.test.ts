import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import type { Db } from 'mongodb';

import { loadServerConfig } from '../server/config';
import { hashPassword } from '../server/password';
import { handleApiRequest } from '../server/routes';
import { issueSetPasswordToken } from '../server/set-password';

const config = loadServerConfig({
  MONGODB_URI: 'mongodb://localhost:27017',
  ALLOW_DEV_AUTH_HEADERS: 'true',
  EXPOSE_SET_PASSWORD_LINK: 'true',
  APP_PUBLIC_URL: 'http://localhost:4200',
});

function platformHeaders(): Record<string, string> {
  return { 'x-iso-actor-uid': 'uid-superadmin', 'x-iso-role': 'platformSuperadmin', 'x-iso-platform': 'true' };
}
function leadHeaders(tenantId: string): Record<string, string> {
  return { 'x-iso-actor-uid': 'uid-lead', 'x-iso-tenant-id': tenantId, 'x-iso-role': 'leadAuditor', 'x-iso-platform': 'false' };
}
function auditorHeaders(tenantId: string): Record<string, string> {
  return { 'x-iso-actor-uid': 'uid-aud', 'x-iso-tenant-id': tenantId, 'x-iso-role': 'auditor', 'x-iso-platform': 'false' };
}

function makeReq(opts: { method: string; url: string; headers?: Record<string, string>; body?: unknown }): IncomingMessage {
  const iterator = (async function* () {
    if (opts.body !== undefined) yield Buffer.from(JSON.stringify(opts.body));
  })();
  const req: Record<string, unknown> = {
    method: opts.method,
    url: opts.url,
    headers: opts.headers ?? {},
    socket: { remoteAddress: '127.0.0.1' },
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

/** A fake Mongo that returns matchedCount/modifiedCount (needed by the token flow). */
function createFakeDb(): { db: Db; store: Map<string, Record<string, unknown>[]> } {
  const store = new Map<string, Record<string, unknown>[]>();
  const getPath = (doc: Record<string, unknown>, key: string): unknown =>
    key.split('.').reduce<unknown>((value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined), doc);
  const matches = (doc: Record<string, unknown>, query: Record<string, unknown>): boolean =>
    Object.keys(query).every((key) => getPath(doc, key) === query[key]);

  const collection = (name: string) => {
    if (!store.has(name)) store.set(name, []);
    const docs = store.get(name)!;
    const applyUpdate = (doc: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
      if (update['$set']) Object.assign(doc, update['$set']);
      if (update['$setOnInsert']) for (const k of Object.keys(update['$setOnInsert'])) if (!(k in doc)) doc[k] = update['$setOnInsert'][k];
      if (update['$addToSet']) for (const k of Object.keys(update['$addToSet'])) {
        const list = Array.isArray(doc[k]) ? (doc[k] as unknown[]) : [];
        if (!list.includes(update['$addToSet'][k])) list.push(update['$addToSet'][k]);
        doc[k] = list;
      }
    };
    return {
      find(query: Record<string, unknown> = {}) {
        const result = docs.filter((d) => matches(d, query)).map((d) => ({ ...d }));
        return { sort: () => ({ toArray: async () => result }), toArray: async () => result };
      },
      async findOne(query: Record<string, unknown> = {}) {
        const found = docs.find((d) => matches(d, query));
        return found ? { ...found } : null;
      },
      async insertOne(doc: Record<string, unknown>) {
        docs.push({ ...doc });
        return { insertedId: doc['id'] ?? 'x' };
      },
      async insertMany(items: Record<string, unknown>[]) {
        docs.push(...items.map((i) => ({ ...i })));
      },
      async updateOne(filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>, opts: { upsert?: boolean } = {}) {
        let doc = docs.find((d) => matches(d, filter));
        const matchedCount = doc ? 1 : 0;
        if (!doc && opts.upsert) {
          doc = { ...filter };
          docs.push(doc);
        }
        if (!doc) return { matchedCount, modifiedCount: 0, upsertedCount: 0 };
        applyUpdate(doc, update);
        return { matchedCount, modifiedCount: matchedCount, upsertedCount: matchedCount ? 0 : 1 };
      },
      async updateMany(filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) {
        const target = docs.filter((d) => matches(d, filter));
        for (const doc of target) applyUpdate(doc, update);
        return { matchedCount: target.length, modifiedCount: target.length };
      },
    };
  };
  return { db: { collection } as unknown as Db, store };
}

function fakeMailer(): { sent: { to: string; subject: string }[]; send: (m: { to: string; subject: string }) => Promise<void> } {
  const sent: { to: string; subject: string }[] = [];
  return { sent, async send(m) { sent.push({ to: m.to, subject: m.subject }); } };
}

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

async function call(deps: { db: Db; mailer?: ReturnType<typeof fakeMailer> }, opts: Parameters<typeof makeReq>[0]) {
  const res = makeRes();
  await handleApiRequest(makeReq(opts), res, { db: deps.db, config, mailer: deps.mailer });
  return res;
}

describe('superadmin authentication', () => {
  it('issues a platform token (no tenant) for a seeded superadmin', async () => {
    const { db, store } = createFakeDb();
    store.set('members', [
      { uid: 'uid-superadmin', tenantId: null, role: 'platformSuperadmin', status: 'active', profile: { email: 'root@platform.test', displayName: 'Root' }, passwordHash: hashPassword('superpw123') },
    ]);
    const ok = await call({ db }, { method: 'POST', url: '/api/auth/superadmin-login', body: { email: 'root@platform.test', password: 'superpw123' } });
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body) as { token: string; user: { role: string; tenantId: string | null } };
    assert.equal(body.user.role, 'platformSuperadmin');
    assert.equal(body.user.tenantId, null);
    assert.ok(body.token.length > 0);

    const bad = await call({ db }, { method: 'POST', url: '/api/auth/superadmin-login', body: { email: 'root@platform.test', password: 'wrong' } });
    assert.equal(bad.statusCode, 401);
  });

  it('does not let a tenant member sign in as superadmin', async () => {
    const { db, store } = createFakeDb();
    store.set('members', [
      { uid: 'uid-lead', tenantId: 't', role: 'leadAuditor', status: 'active', profile: { email: 'lead@firm.test', displayName: 'Lead' }, passwordHash: hashPassword('leadpw123') },
    ]);
    const res = await call({ db }, { method: 'POST', url: '/api/auth/superadmin-login', body: { email: 'lead@firm.test', password: 'leadpw123' } });
    assert.equal(res.statusCode, 401);
  });
});

describe('superadmin provisioning (/api/admin)', () => {
  const provisionBody = {
    tenantName: 'Northstar Components',
    plan: 'pilot',
    leadAuditor: { email: 'ava@firm.test', displayName: 'Ava Brooks' },
    clientUsers: [
      { email: 'dana@northstar.test', displayName: 'Dana Okoro' },
      { email: 'sam@northstar.test', displayName: 'Sam Lee' },
    ],
    idempotencyKey: 'prov-key-000001',
  };

  it('provisions a tenant + lead auditor + client users as invited, with links and emails', async () => {
    const { db, store } = createFakeDb();
    const mailer = fakeMailer();
    const res = await call({ db, mailer }, { method: 'POST', url: '/api/admin/tenants', headers: platformHeaders(), body: provisionBody });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body) as { tenantId: string; members: { role: string; status: string; setPasswordLink?: string }[] };
    assert.ok(body.tenantId.startsWith('tenant-'));
    assert.equal(body.members.length, 3);
    assert.equal(body.members.filter((m) => m.status === 'invited').length, 3);
    assert.equal(body.members.filter((m) => m.role === 'leadAuditor').length, 1);
    assert.ok(body.members.every((m) => typeof m.setPasswordLink === 'string'));
    assert.equal(mailer.sent.length, 3);
    assert.equal((store.get('members') ?? []).length, 3);
    assert.equal((store.get('setPasswordTokens') ?? []).length, 3);
    // Created members never carry a password hash until they set one.
    assert.ok((store.get('members') ?? []).every((m) => !('passwordHash' in m)));
  });

  it('is idempotent on the idempotency key (no duplicate tenant or repeat emails)', async () => {
    const { db, store } = createFakeDb();
    const mailer = fakeMailer();
    await call({ db, mailer }, { method: 'POST', url: '/api/admin/tenants', headers: platformHeaders(), body: provisionBody });
    const again = await call({ db, mailer }, { method: 'POST', url: '/api/admin/tenants', headers: platformHeaders(), body: provisionBody });
    assert.equal(again.statusCode, 200);
    assert.equal(JSON.parse(again.body).idempotent, true);
    assert.equal((store.get('tenants') ?? []).length, 1);
    assert.equal(mailer.sent.length, 3);
  });

  it('lists tenants with member counts and never leaks password hashes', async () => {
    const { db } = createFakeDb();
    await call({ db }, { method: 'POST', url: '/api/admin/tenants', headers: platformHeaders(), body: provisionBody });
    const res = await call({ db }, { method: 'GET', url: '/api/admin/tenants', headers: platformHeaders() });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as { tenants: { id: string; memberCount: number }[] };
    assert.equal(body.tenants.length, 1);
    assert.equal(body.tenants[0]?.memberCount, 3);

    const members = await call({ db }, { method: 'GET', url: `/api/admin/tenants/${body.tenants[0]!.id}/members`, headers: platformHeaders() });
    const list = JSON.parse(members.body) as { members: Record<string, unknown>[] };
    assert.ok(list.members.every((m) => !('passwordHash' in m)));
  });

  it('blocks non-superadmins from /api/admin and keeps platform tokens out of tenant routes', async () => {
    const { db } = createFakeDb();
    const denied = await call({ db }, { method: 'POST', url: '/api/admin/tenants', headers: leadHeaders('t'), body: provisionBody });
    assert.equal(denied.statusCode, 401);
    // The requireTenant invariant: a platform token must be rejected by tenant routes.
    const tenantRoute = await call({ db }, { method: 'GET', url: '/api/tenants/t/audits/a/field-state', headers: platformHeaders() });
    assert.equal(tenantRoute.statusCode, 401);
  });

  it('resend supersedes the prior link', async () => {
    const { db, store } = createFakeDb();
    const provisioned = await call({ db }, { method: 'POST', url: '/api/admin/tenants', headers: platformHeaders(), body: provisionBody });
    const tenantId = JSON.parse(provisioned.body).tenantId as string;
    const member = (store.get('members') ?? []).find((m) => (m['profile'] as { email?: string }).email === 'dana@northstar.test')!;
    const res = await call({ db }, { method: 'POST', url: `/api/admin/tenants/${tenantId}/members/${member['uid']}/resend`, headers: platformHeaders() });
    assert.equal(res.statusCode, 200);
    const tokens = (store.get('setPasswordTokens') ?? []).filter((t) => t['uid'] === member['uid']);
    assert.equal(tokens.length, 2);
    assert.equal(tokens.filter((t) => t['consumedAt'] === null).length, 1); // only the newest is live
  });
});

describe('set-password flow', () => {
  async function provisionOne(): Promise<{ db: Db; store: Map<string, Record<string, unknown>[]>; token: string }> {
    const { db, store } = createFakeDb();
    const res = await call({ db }, {
      method: 'POST',
      url: '/api/admin/tenants',
      headers: platformHeaders(),
      body: { tenantName: 'Acme', plan: 'pilot', leadAuditor: { email: 'lead@acme.test', displayName: 'Lead' }, clientUsers: [], idempotencyKey: 'prov-key-acme01' },
    });
    const link = JSON.parse(res.body).members[0].setPasswordLink as string;
    return { db, store, token: tokenFromLink(link) };
  }

  it('validates a live token and lets it set a password exactly once', async () => {
    const { db, store, token } = await provisionOne();
    const info = await call({ db }, { method: 'GET', url: `/api/auth/set-password/${encodeURIComponent(token)}` });
    assert.equal(JSON.parse(info.body).valid, true);

    const set = await call({ db }, { method: 'POST', url: '/api/auth/set-password', body: { token, password: 'newpassword1' } });
    assert.equal(set.statusCode, 200);
    const member = (store.get('members') ?? [])[0]!;
    assert.equal(member['status'], 'active');
    assert.equal(typeof member['passwordHash'], 'string');

    const reuse = await call({ db }, { method: 'POST', url: '/api/auth/set-password', body: { token, password: 'another12345' } });
    assert.equal(reuse.statusCode, 400); // single use
  });

  it('returns a generic invalid for unknown tokens (no enumeration)', async () => {
    const { db } = createFakeDb();
    const info = await call({ db }, { method: 'GET', url: '/api/auth/set-password/not-a-real-token-string' });
    assert.equal(JSON.parse(info.body).valid, false);
    const post = await call({ db }, { method: 'POST', url: '/api/auth/set-password', body: { token: 'not-a-real-token-string', password: 'whatever12345' } });
    assert.equal(post.statusCode, 400);
  });

  it('rejects an expired token', async () => {
    const { db, store } = createFakeDb();
    const raw = 'expired-token-value-1234567890';
    store.set('members', [{ uid: 'u1', tenantId: 't', role: 'clientViewer', status: 'invited', profile: { email: 'x@y.test', displayName: 'X' } }]);
    store.set('setPasswordTokens', [
      { id: 'spt-1', tokenHash: createHash('sha256').update(raw).digest('hex'), uid: 'u1', tenantId: 't', email: 'x@y.test', purpose: 'invite', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-02T00:00:00.000Z', consumedAt: null },
    ]);
    const res = await call({ db }, { method: 'POST', url: '/api/auth/set-password', body: { token: raw, password: 'newpassword1' } });
    assert.equal(res.statusCode, 400);
  });
});

describe('delegated lead-auditor member management', () => {
  it('lets a lead auditor invite a client user (link, no temp password)', async () => {
    const { db, store } = createFakeDb();
    store.set('tenants', [{ id: 't', name: 'Acme', plan: 'pilot', status: 'active' }]);
    const mailer = fakeMailer();
    const res = await call({ db, mailer }, {
      method: 'POST',
      url: '/api/tenants/t/members',
      headers: leadHeaders('t'),
      body: { email: 'contact@acme.test', displayName: 'Contact', role: 'clientViewer' },
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body) as { member: { status: string }; setPasswordLink?: string };
    assert.equal(body.member.status, 'invited');
    assert.ok(typeof body.setPasswordLink === 'string');
    assert.equal(mailer.sent.length, 1);
    assert.ok((store.get('members') ?? []).every((m) => !('passwordHash' in m)));
  });

  it('forbids an auditor from creating users and a lead from minting a tenant admin', async () => {
    const { db, store } = createFakeDb();
    store.set('tenants', [{ id: 't', name: 'Acme', plan: 'pilot', status: 'active' }]);
    const auditor = await call({ db }, { method: 'POST', url: '/api/tenants/t/members', headers: auditorHeaders('t'), body: { email: 'a@b.test', displayName: 'A', role: 'clientViewer' } });
    assert.equal(auditor.statusCode, 401);
    const admin = await call({ db }, { method: 'POST', url: '/api/tenants/t/members', headers: leadHeaders('t'), body: { email: 'a@b.test', displayName: 'A', role: 'tenantAdmin' } });
    assert.equal(admin.statusCode, 401);
  });

  it('issues a reset link and rejects cross-tenant access', async () => {
    const { db, store } = createFakeDb();
    store.set('tenants', [{ id: 't', name: 'Acme', plan: 'pilot', status: 'active' }]);
    store.set('members', [{ uid: 'u9', tenantId: 't', role: 'clientViewer', status: 'active', profile: { email: 'c@acme.test', displayName: 'C' }, passwordHash: hashPassword('old12345') }]);
    const reset = await call({ db }, { method: 'POST', url: '/api/tenants/t/members/u9/password', headers: leadHeaders('t') });
    assert.equal(reset.statusCode, 200);
    assert.ok(typeof JSON.parse(reset.body).setPasswordLink === 'string');

    const cross = await call({ db }, { method: 'POST', url: '/api/tenants/t/members/u9/password', headers: leadHeaders('other-tenant') });
    assert.equal(cross.statusCode, 401);
  });
});

describe('superadmin invite + set-password (tenant-less account)', () => {
  it('lets an invited superadmin choose a password, flags the platform account, and signs in', async () => {
    const { db, store } = createFakeDb();
    store.set('members', [
      { uid: 'uid-superadmin', tenantId: null, role: 'platformSuperadmin', status: 'invited', profile: { email: 'jamil@trainovations.com', displayName: 'Jamil Jones' } },
    ]);
    const { token } = await issueSetPasswordToken(
      db,
      { uid: 'uid-superadmin', tenantId: null, email: 'jamil@trainovations.com', purpose: 'invite' },
      config,
    );

    // The set-password page learns it's a platform account (so it routes to /admin/login).
    const info = await call({ db }, { method: 'GET', url: `/api/auth/set-password/${encodeURIComponent(token)}` });
    const desc = JSON.parse(info.body) as { valid: boolean; platform?: boolean; email?: string };
    assert.equal(desc.valid, true);
    assert.equal(desc.platform, true);
    assert.equal(desc.email, 'jamil@trainovations.com');

    const set = await call({ db }, { method: 'POST', url: '/api/auth/set-password', body: { token, password: 'superSecret12' } });
    assert.equal(set.statusCode, 200);
    const member = (store.get('members') ?? [])[0]!;
    assert.equal(member['status'], 'active');
    assert.equal(typeof member['passwordHash'], 'string');

    const login = await call({ db }, { method: 'POST', url: '/api/auth/superadmin-login', body: { email: 'jamil@trainovations.com', password: 'superSecret12' } });
    assert.equal(login.statusCode, 200);
    assert.equal(JSON.parse(login.body).user.role, 'platformSuperadmin');
  });
});
