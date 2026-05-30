import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { authenticateRequest, issueMemberToken } from '../server/auth';
import { loadServerConfig } from '../server/config';
import { signJwt, verifyJwt } from '../server/jwt';
import { hashPassword, verifyPassword } from '../server/password';

const config = loadServerConfig({ MONGODB_URI: 'mongodb://localhost:27017', JWT_SECRET: 'unit-test-secret' });

describe('jwt', () => {
  it('signs and verifies a token round-trip', () => {
    const token = signJwt({ sub: 'u1', role: 'auditor', platform: false, tenantId: 't1' }, 'secret', 60);
    const claims = verifyJwt(token, 'secret');
    assert.equal(claims.sub, 'u1');
    assert.equal(claims.role, 'auditor');
    assert.equal(claims.tenantId, 't1');
  });

  it('rejects a wrong secret', () => {
    const token = signJwt({ sub: 'u1', role: 'auditor', platform: false }, 'secret', 60);
    assert.throws(() => verifyJwt(token, 'other-secret'));
  });

  it('rejects a tampered payload', () => {
    const token = signJwt({ sub: 'u1', role: 'auditor', platform: false, tenantId: 't1' }, 'secret', 60);
    const [header, , signature] = token.split('.');
    const forgedClaims = Buffer.from(
      JSON.stringify({ sub: 'admin', role: 'leadAuditor', platform: false, tenantId: 't1', exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url');
    assert.throws(() => verifyJwt(`${header}.${forgedClaims}.${signature}`, 'secret'));
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 'u1', role: 'auditor', platform: false }, 'secret', -10);
    assert.throws(() => verifyJwt(token, 'secret'));
  });
});

describe('password hashing', () => {
  it('verifies the correct password and rejects others', () => {
    const stored = hashPassword('correct horse battery staple');
    assert.equal(verifyPassword('correct horse battery staple', stored), true);
    assert.equal(verifyPassword('wrong password', stored), false);
  });
});

describe('authenticateRequest', () => {
  it('accepts a valid bearer token and resolves the actor', () => {
    const { token } = issueMemberToken({ uid: 'u1', tenantId: 't1', role: 'auditor' }, config);
    const actor = authenticateRequest({ headers: { authorization: `Bearer ${token}` } }, config);
    assert.equal(actor.uid, 'u1');
    assert.equal(actor.platform, false);
    if (!actor.platform) {
      assert.equal(actor.tenantId, 't1');
    }
  });

  it('rejects a request with no token when dev headers are disabled', () => {
    assert.equal(config.allowDevAuthHeaders, false);
    assert.throws(() => authenticateRequest({ headers: {} }, config));
  });
});
