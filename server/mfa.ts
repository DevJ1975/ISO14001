import { createHmac, randomBytes } from 'node:crypto';

import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  verifyTotp,
  type HmacSha1,
} from '../src/app/core/domain/index.js';

// Server-side binding of the pure TOTP module (src/app/core/domain/totp.ts) to
// node:crypto. SECURITY: the TOTP secret is generated here, stored only as a
// base32 string on the member, and never logged.

const nodeHmacSha1: HmacSha1 = (key, message) =>
  new Uint8Array(createHmac('sha1', Buffer.from(key)).update(Buffer.from(message)).digest());

/** Generate a fresh 160-bit base32 TOTP secret (the RFC-recommended length). */
export function generateMfaSecret(): string {
  return base32Encode(new Uint8Array(randomBytes(20)));
}

/** Build the otpauth:// URI for the authenticator app from a base32 secret. */
export function mfaOtpAuthUri(secretBase32: string, accountName: string, issuer = 'ISO Audit'): string {
  return buildOtpAuthUri({ secretBase32, accountName, issuer });
}

/** Verify a 6-digit code against a stored base32 secret (±1 step of skew). */
export function verifyMfaCode(secretBase32: string, code: string): boolean {
  try {
    return verifyTotp(nodeHmacSha1, base32Decode(secretBase32), code, { window: 1 });
  } catch {
    // base32Decode throws on a corrupt stored secret — treat as a failed factor.
    return false;
  }
}

export const MFA_ISSUER = 'ISO Audit';
