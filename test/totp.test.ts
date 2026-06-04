import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  base32Decode,
  base32Encode,
  buildAuthorizationUrl,
  buildOtpAuthUri,
  generateTotp,
  scimResolveDisplayName,
  scimResolveEmail,
  truncate,
  verifyTotp,
  type HmacSha1,
} from '../src/app/core/domain/index';

// HMAC-SHA1 binding for the tests (same primitive server/mfa.ts uses).
const hmac: HmacSha1 = (key, message) =>
  new Uint8Array(createHmac('sha1', Buffer.from(key)).update(Buffer.from(message)).digest());

// RFC 6238 Appendix B uses the ASCII seed "12345678901234567890" (20 bytes).
const RFC_SECRET = new TextEncoder().encode('12345678901234567890');

describe('TOTP (RFC 6238) — known test vectors', () => {
  // From RFC 6238 Appendix B, SHA-1, 8 digits. We take the trailing 6 digits to
  // validate our default 6-digit output against the same time-steps.
  const vectors: Array<{ time: number; eightDigit: string }> = [
    { time: 59, eightDigit: '94287082' },
    { time: 1111111109, eightDigit: '07081804' },
    { time: 1111111111, eightDigit: '14050471' },
    { time: 1234567890, eightDigit: '89005924' },
    { time: 2000000000, eightDigit: '69279037' },
    { time: 20000000000, eightDigit: '65353130' },
  ];

  for (const { time, eightDigit } of vectors) {
    it(`matches the RFC vector at t=${time}`, () => {
      const expected6 = eightDigit.slice(-6);
      const code = generateTotp(hmac, RFC_SECRET, { nowMs: time * 1000 });
      assert.equal(code, expected6);
    });
  }
});

describe('truncate (RFC 4226 dynamic truncation)', () => {
  it('produces the documented 6-digit value for the appendix HMAC', () => {
    // RFC 4226 Appendix D: counter 0 over the same seed yields 755224.
    const digest = hmac(RFC_SECRET, Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]));
    assert.equal(truncate(digest, 6), '755224');
  });
});

describe('verifyTotp', () => {
  it('accepts the current code and rejects a wrong one', () => {
    const now = 1234567890 * 1000;
    const code = generateTotp(hmac, RFC_SECRET, { nowMs: now });
    assert.equal(verifyTotp(hmac, RFC_SECRET, code, { nowMs: now }), true);
    assert.equal(verifyTotp(hmac, RFC_SECRET, '000000', { nowMs: now }), false);
  });

  it('tolerates one step of clock drift within the window', () => {
    const base = 1234567890 * 1000;
    const prevCode = generateTotp(hmac, RFC_SECRET, { nowMs: base - 30_000 });
    // A code generated 30s ago still verifies at the current step with window=1.
    assert.equal(verifyTotp(hmac, RFC_SECRET, prevCode, { nowMs: base, window: 1 }), true);
    // ...but not with no window.
    assert.equal(verifyTotp(hmac, RFC_SECRET, prevCode, { nowMs: base, window: 0 }), false);
  });

  it('rejects malformed input without throwing', () => {
    assert.equal(verifyTotp(hmac, RFC_SECRET, 'abc', {}), false);
    assert.equal(verifyTotp(hmac, RFC_SECRET, '', {}), false);
    assert.equal(verifyTotp(hmac, RFC_SECRET, '1234567', {}), false);
  });
});

describe('base32 round-trip (RFC 4648)', () => {
  it('encodes and decodes back to the same bytes', () => {
    const bytes = Uint8Array.from([0, 1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255]);
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  });

  it('matches a known RFC 4648 vector ("foobar")', () => {
    assert.equal(base32Encode(new TextEncoder().encode('foobar')), 'MZXW6YTBOI');
    assert.deepEqual(base32Decode('MZXW6YTBOI'), new TextEncoder().encode('foobar'));
  });

  it('tolerates lower-case, spaces and padding on decode', () => {
    assert.deepEqual(base32Decode('mz xw 6y tb oi='), new TextEncoder().encode('foobar'));
  });

  it('throws on an invalid character', () => {
    assert.throws(() => base32Decode('MZXW6YTB0I')); // 0 is not in the alphabet
  });
});

describe('otpauth + authorization URL builders', () => {
  it('builds a spec-shaped otpauth URI carrying the secret/issuer', () => {
    const uri = buildOtpAuthUri({ secretBase32: 'JBSWY3DPEHPK3PXP', accountName: 'a@b.com', issuer: 'ISO Audit' });
    assert.ok(uri.startsWith('otpauth://totp/ISO%20Audit%3Aa%40b.com?'));
    assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
    assert.match(uri, /issuer=ISO\+Audit/);
    assert.match(uri, /digits=6/);
    assert.match(uri, /period=30/);
  });

  it('builds an OIDC authorization URL with response_type=code and state/nonce', () => {
    const url = buildAuthorizationUrl({
      config: { issuer: 'https://idp.example.com/', clientId: 'client-123', scopes: 'openid email' },
      redirectUri: 'https://app.example.com/auth/sso/callback',
      state: 'tenant-1.abc',
      nonce: 'nonce-1',
    });
    assert.ok(url.startsWith('https://idp.example.com/authorize?'));
    assert.match(url, /response_type=code/);
    assert.match(url, /client_id=client-123/);
    assert.match(url, /state=tenant-1\.abc/);
    assert.match(url, /nonce=nonce-1/);
  });

  it('prefers an explicit authorization endpoint when provided', () => {
    const url = buildAuthorizationUrl({
      config: { issuer: 'https://idp.example.com', clientId: 'c', authorizationEndpoint: 'https://idp.example.com/oauth2/auth', scopes: 'openid' },
      redirectUri: 'https://app/cb',
      state: 's',
      nonce: 'n',
    });
    assert.ok(url.startsWith('https://idp.example.com/oauth2/auth?'));
  });
});

describe('SCIM mapping helpers', () => {
  it('resolves the primary email then falls back to userName', () => {
    assert.equal(
      scimResolveEmail({ externalId: 'x', userName: 'fallback@org.com', active: true, emails: [{ value: 'primary@org.com', primary: true }] }),
      'primary@org.com',
    );
    assert.equal(scimResolveEmail({ externalId: 'x', userName: 'Login@Org.com', active: true }), 'login@org.com');
    assert.equal(scimResolveEmail({ externalId: 'x', userName: 'not-an-email', active: true }), null);
  });

  it('resolves a display name with sensible fallbacks', () => {
    assert.equal(
      scimResolveDisplayName({ externalId: 'x', userName: 'a@b.com', active: true, displayName: 'Ada Lovelace' }, 'a@b.com'),
      'Ada Lovelace',
    );
    assert.equal(
      scimResolveDisplayName({ externalId: 'x', userName: 'a@b.com', active: true, name: { givenName: 'Ada', familyName: 'L' } }, 'a@b.com'),
      'Ada L',
    );
    assert.equal(scimResolveDisplayName({ externalId: 'x', userName: 'a@b.com', active: true }, 'ada@b.com'), 'ada');
  });
});
