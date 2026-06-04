import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal dependency-free HS256 JWT sign/verify. Good enough for first-party
// tokens; swap for an asymmetric IdP (JWKS) if federating identity later.

export interface JwtClaims {
  sub: string;
  role: string;
  platform: boolean;
  tenantId?: string;
  /** Marks a short-lived MFA challenge token (not a session token). */
  mfa?: boolean;
  iat: number;
  exp: number;
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signJwt(
  payload: { sub: string; role: string; platform: boolean; tenantId?: string; mfa?: boolean },
  secret: string,
  ttlSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const claims = encodeSegment({ ...payload, iat: now, exp: now + ttlSeconds });
  const data = `${header}.${claims}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtClaims {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('Malformed token.');
  }
  const [header, claims, signature] = segments;
  const expected = createHmac('sha256', secret).update(`${header}.${claims}`).digest();
  const provided = Buffer.from(signature!, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error('Invalid token signature.');
  }
  const payload = JSON.parse(Buffer.from(claims!, 'base64url').toString('utf8')) as JwtClaims;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired.');
  }
  return payload;
}
