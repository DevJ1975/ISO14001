import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import type { Db } from 'mongodb';

import { loadServerConfig } from '../server/config';
import { generateMfaSecret } from '../server/mfa';
import { hashPassword } from '../server/password';
import { handleApiRequest } from '../server/routes';
import { base32Decode, generateTotp, type HmacSha1 } from '../src/app/core/domain/index';

const config = loadServerConfig({
  MONGODB_URI: 'mongodb://localhost:27017',
  ALLOW_DEV_AUTH_HEADERS: 'true',
  JWT_SECRET: 'enterprise-test-secret',
});

const hmac: HmacSha1 = (key, message) =>
  new Uint8Array(createHmac('sha1', Buffer.from(key)).update(Buffer.from(message)).digest());

function codeFor(secretBase32: string): string {
  return generateTotp(hmac, base32Decode(secretBase32));
}

function leadHeaders(tenantId: string, uid = 'uid-lead'): Record<string, string> {
  return { 'x-iso-actor-uid': uid, 'x-iso-tenant-id': tenantId, 'x-iso-role': 'leadAuditor', 'x-iso-platform': 'false' };
}
function adminHeaders(tenantId: string, uid = 'uid-admin'): Record<string, string> {
  return { 'x-iso-actor-uid': uid, 'x-iso-tenant-id': tenantId, 'x-iso-role': 'tenantAdmin', 'x-iso-platform': 'false' };
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

/** Fake Mongo supporting the subset routes use (matched on platform-admin test). */
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

async function call(db: Db, opts: Parameters<typeof makeReq>[0]) {
  const res = makeRes();
  await handleApiRequest(makeReq(opts), res, { db, config });
  return res;
}

function seedMember(store: Map<string, Record<string, unknown>[]>, member: Record<string, unknown>): void {
  const list = store.get('members') ?? [];
  list.push(member);
  store.set('members', list);
}

describe('TOTP MFA — enrol, activate, login challenge', () => {
  it('enrols, activates, then requires the second factor at login', async () => {
    const { db, store } = createFakeDb();
    seedMember(store, {
      uid: 'uid-lead',
      tenantId: 't1',
      role: 'leadAuditor',
      status: 'active',
      profile: { email: 'lead@org.test', displayName: 'Lead' },
      passwordHash: hashPassword('password123'),
    });

    // Enrol: returns a secret + otpauth URI; MFA still off until activated.
    const enroll = await call(db, { method: 'POST', url: '/api/tenants/t1/mfa/enroll', headers: leadHeaders('t1'), body: {} });
    assert.equal(enroll.statusCode, 200);
    const { secret, otpauthUri } = JSON.parse(enroll.body) as { secret: string; otpauthUri: string };
    assert.ok(secret.length >= 16);
    assert.match(otpauthUri, /^otpauth:\/\/totp\//);

    // Login still works (MFA not active yet) — no challenge.
    const preLogin = await call(db, { method: 'POST', url: '/api/auth/login', body: { email: 'lead@org.test', password: 'password123' } });
    assert.equal(preLogin.statusCode, 200);
    assert.ok((JSON.parse(preLogin.body) as { token?: string }).token);

    // A wrong activation code is rejected.
    const badActivate = await call(db, { method: 'POST', url: '/api/tenants/t1/mfa/activate', headers: leadHeaders('t1'), body: { code: '000000' } });
    assert.equal(badActivate.statusCode, 400);

    // Activate with a real code.
    const activate = await call(db, { method: 'POST', url: '/api/tenants/t1/mfa/activate', headers: leadHeaders('t1'), body: { code: codeFor(secret) } });
    assert.equal(activate.statusCode, 200);
    assert.equal((JSON.parse(activate.body) as { enabled: boolean }).enabled, true);

    // Now login returns a challenge, not a token.
    const login = await call(db, { method: 'POST', url: '/api/auth/login', body: { email: 'lead@org.test', password: 'password123' } });
    assert.equal(login.statusCode, 200);
    const challenge = JSON.parse(login.body) as { mfaRequired?: boolean; challengeToken?: string; token?: string };
    assert.equal(challenge.mfaRequired, true);
    assert.ok(challenge.challengeToken);
    assert.equal(challenge.token, undefined);

    // Wrong code at step 2 → 401.
    const badStep2 = await call(db, { method: 'POST', url: '/api/auth/mfa/login', body: { challengeToken: challenge.challengeToken, code: '111111' } });
    assert.equal(badStep2.statusCode, 401);

    // Correct code → a real session token.
    const step2 = await call(db, { method: 'POST', url: '/api/auth/mfa/login', body: { challengeToken: challenge.challengeToken, code: codeFor(secret) } });
    assert.equal(step2.statusCode, 200);
    const session = JSON.parse(step2.body) as { token?: string; user?: { uid: string } };
    assert.ok(session.token);
    assert.equal(session.user?.uid, 'uid-lead');
  });

  it('reports status and disables MFA with a valid code', async () => {
    const { db, store } = createFakeDb();
    const secret = generateMfaSecret();
    seedMember(store, {
      uid: 'uid-lead',
      tenantId: 't1',
      role: 'leadAuditor',
      status: 'active',
      profile: { email: 'lead@org.test', displayName: 'Lead' },
      passwordHash: hashPassword('password123'),
      mfa: { enabled: true, secret },
    });
    const status = await call(db, { method: 'GET', url: '/api/tenants/t1/mfa', headers: leadHeaders('t1') });
    assert.equal((JSON.parse(status.body) as { enabled: boolean }).enabled, true);

    const disabled = await call(db, { method: 'POST', url: '/api/tenants/t1/mfa/disable', headers: leadHeaders('t1'), body: { code: codeFor(secret) } });
    assert.equal(disabled.statusCode, 200);
    assert.equal((JSON.parse(disabled.body) as { enabled: boolean }).enabled, false);

    // Login no longer challenges.
    const login = await call(db, { method: 'POST', url: '/api/auth/login', body: { email: 'lead@org.test', password: 'password123' } });
    assert.ok((JSON.parse(login.body) as { token?: string }).token);
  });

  it('never returns a session token from /auth/mfa/login with a stale challenge for a disabled account', async () => {
    const { db, store } = createFakeDb();
    seedMember(store, { uid: 'u', tenantId: 't1', role: 'auditor', status: 'active', profile: { email: 'a@org.test' }, passwordHash: hashPassword('password123') });
    // Account has no MFA → a forged-but-unsigned challenge must fail.
    const res = await call(db, { method: 'POST', url: '/api/auth/mfa/login', body: { challengeToken: 'not.a.jwt', code: '123456' } });
    assert.equal(res.statusCode, 401);
  });
});

describe('SSO (OIDC) tenant config + initiate + callback', () => {
  it('stores config (admin), exposes a public view, and builds a real authorization redirect', async () => {
    const { db } = createFakeDb();
    // Non-admin cannot configure SSO.
    const forbidden = await call(db, {
      method: 'PUT',
      url: '/api/tenants/t1/sso',
      headers: leadHeaders('t1'),
      body: { enabled: true, issuer: 'https://idp.example.com', clientId: 'c1', displayName: 'Acme SSO' },
    });
    assert.equal(forbidden.statusCode, 401);

    const put = await call(db, {
      method: 'PUT',
      url: '/api/tenants/t1/sso',
      headers: adminHeaders('t1'),
      body: { enabled: true, issuer: 'https://idp.example.com', clientId: 'c1', displayName: 'Acme SSO' },
    });
    assert.equal(put.statusCode, 200);

    // Public view (no auth) reveals enabled + displayName only.
    const pub = await call(db, { method: 'GET', url: '/api/tenants/t1/sso/public' });
    assert.deepEqual(JSON.parse(pub.body), { enabled: true, displayName: 'Acme SSO' });

    // Initiate builds a spec-correct authorization URL + state.
    const initiate = await call(db, { method: 'POST', url: '/api/auth/sso/initiate', body: { tenantId: 't1' } });
    assert.equal(initiate.statusCode, 200);
    const { authorizationUrl, state } = JSON.parse(initiate.body) as { authorizationUrl: string; state: string };
    assert.ok(authorizationUrl.startsWith('https://idp.example.com/authorize?'));
    assert.match(authorizationUrl, /response_type=code/);
    assert.match(authorizationUrl, /client_id=c1/);
    assert.ok(state.startsWith('t1.'));

    // Callback is gated (501) when SSO_LIVE_EXCHANGE is off — never fakes a session.
    const cb = await call(db, { method: 'GET', url: '/api/auth/sso/callback?code=abc&state=t1.x' });
    assert.equal(cb.statusCode, 501);
    assert.equal((JSON.parse(cb.body) as { error: string }).error, 'sso_exchange_not_enabled');
  });

  it('public view returns disabled when no config exists', async () => {
    const { db } = createFakeDb();
    const pub = await call(db, { method: 'GET', url: '/api/tenants/t1/sso/public' });
    assert.deepEqual(JSON.parse(pub.body), { enabled: false });
    const initiate = await call(db, { method: 'POST', url: '/api/auth/sso/initiate', body: { tenantId: 't1' } });
    assert.equal(initiate.statusCode, 404);
  });
});

describe('SCIM provisioning', () => {
  it('mints a token (admin), then provisions and deprovisions a user with it', async () => {
    const { db } = createFakeDb();
    // Mint a provisioning token.
    const mint = await call(db, { method: 'POST', url: '/api/tenants/t1/scim-token', headers: adminHeaders('t1') });
    assert.equal(mint.statusCode, 201);
    const { token } = JSON.parse(mint.body) as { token: string };
    assert.ok(token.startsWith('scim_'));
    const scimHeaders = { authorization: `Bearer ${token}` };

    // Wrong token → 401.
    const unauth = await call(db, { method: 'POST', url: '/api/scim/v2/Users', headers: { authorization: 'Bearer wrong' }, body: { externalId: 'ext-1', userName: 'jo@org.test' } });
    assert.equal(unauth.statusCode, 401);

    // Provision a user.
    const create = await call(db, {
      method: 'POST',
      url: '/api/scim/v2/Users',
      headers: scimHeaders,
      body: { externalId: 'ext-1', userName: 'jo@org.test', displayName: 'Jo Doe', active: true },
    });
    assert.equal(create.statusCode, 201);
    const created = JSON.parse(create.body) as { id: string; userName: string; active: boolean; externalId: string };
    assert.equal(created.userName, 'jo@org.test');
    assert.equal(created.active, true);
    assert.equal(created.externalId, 'ext-1');

    // Idempotent re-create → 200, same email.
    const again = await call(db, {
      method: 'POST',
      url: '/api/scim/v2/Users',
      headers: scimHeaders,
      body: { externalId: 'ext-1', userName: 'jo@org.test', active: true },
    });
    assert.equal(again.statusCode, 200);

    // Deprovision by externalId → 204, member becomes disabled.
    const del = await call(db, { method: 'DELETE', url: '/api/scim/v2/Users/ext-1', headers: scimHeaders });
    assert.equal(del.statusCode, 204);

    // Revoke the token → subsequent calls 401.
    const revoke = await call(db, { method: 'PUT', url: '/api/tenants/t1/scim-token', headers: adminHeaders('t1') });
    assert.equal(revoke.statusCode, 200);
    const afterRevoke = await call(db, { method: 'POST', url: '/api/scim/v2/Users', headers: scimHeaders, body: { externalId: 'ext-2', userName: 'x@org.test' } });
    assert.equal(afterRevoke.statusCode, 401);
  });

  it('rejects a SCIM payload without a usable email', async () => {
    const { db } = createFakeDb();
    const mint = await call(db, { method: 'POST', url: '/api/tenants/t1/scim-token', headers: adminHeaders('t1') });
    const { token } = JSON.parse(mint.body) as { token: string };
    const res = await call(db, { method: 'POST', url: '/api/scim/v2/Users', headers: { authorization: `Bearer ${token}` }, body: { externalId: 'e', userName: 'no-email' } });
    assert.equal(res.statusCode, 400);
  });
});
