// Pure, dependency-free TOTP (RFC 6238) + HOTP (RFC 4226) primitives, plus
// base32 (RFC 4648) for the shared secret. Used by the enterprise MFA feature.
//
// SECURITY: these are pure functions over an injected HMAC. The Node backend
// passes node:crypto's createHmac; the Supabase edge function passes a Web
// Crypto wrapper. No secret is ever logged here — callers must keep it server
// side and only surface it to the enrolling user once (the otpauth URI/secret).

/** Standard authenticator parameters: SHA-1, 6 digits, 30-second period. */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_ALGORITHM = 'SHA1' as const;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode bytes as unpadded RFC 4648 base32 (the format authenticator apps expect). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decode an RFC 4648 base32 string back to bytes. Tolerates lower-case,
 * padding, and spaces (users often paste secrets with spaces). Throws on any
 * character outside the alphabet so a malformed secret fails loudly server-side.
 */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 character in TOTP secret.');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

/** Big-endian 8-byte counter, as HOTP requires. */
export function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  // JS bitwise ops are 32-bit; split into high/low halves to stay exact.
  let value = Math.floor(counter);
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return bytes;
}

/** A synchronous HMAC-SHA1 over (key, message) → 20-byte digest. */
export type HmacSha1 = (key: Uint8Array, message: Uint8Array) => Uint8Array;

/**
 * RFC 4226 dynamic-truncation of an HMAC digest into a zero-padded N-digit code.
 * Kept separate so it can be unit-tested against the RFC 4226 appendix vectors.
 */
export function truncate(digest: Uint8Array, digits: number = TOTP_DIGITS): string {
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  const code = binary % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

/** RFC 4226 HOTP: HMAC-SHA1 of the counter, dynamically truncated. */
export function generateHotp(hmac: HmacSha1, secret: Uint8Array, counter: number, digits: number = TOTP_DIGITS): string {
  const digest = hmac(secret, counterToBytes(counter));
  return truncate(digest, digits);
}

/** The TOTP time-step (counter) for a given unix-millis timestamp. */
export function timeCounter(nowMs: number, periodSeconds: number = TOTP_PERIOD_SECONDS): number {
  return Math.floor(nowMs / 1000 / periodSeconds);
}

export interface TotpOptions {
  readonly nowMs?: number;
  readonly periodSeconds?: number;
  readonly digits?: number;
}

/** RFC 6238 TOTP: the current HOTP code for the time-step at `nowMs`. */
export function generateTotp(hmac: HmacSha1, secret: Uint8Array, options: TotpOptions = {}): string {
  const period = options.periodSeconds ?? TOTP_PERIOD_SECONDS;
  const digits = options.digits ?? TOTP_DIGITS;
  return generateHotp(hmac, secret, timeCounter(options.nowMs ?? Date.now(), period), digits);
}

/**
 * Constant-time string comparison for 6-digit codes. Avoids leaking timing
 * information about how many leading digits matched.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface VerifyTotpOptions extends TotpOptions {
  /** How many ±steps of clock drift to accept (default 1 → ±30s). */
  readonly window?: number;
}

/**
 * Verify a user-supplied 6-digit code against the secret, allowing ±`window`
 * time-steps of clock skew. Returns false (never throws) for malformed input so
 * a bad code is just a failed second factor, not a 500.
 */
export function verifyTotp(hmac: HmacSha1, secret: Uint8Array, token: string, options: VerifyTotpOptions = {}): boolean {
  const normalized = (token ?? '').trim();
  const digits = options.digits ?? TOTP_DIGITS;
  if (!new RegExp(`^[0-9]{${digits}}$`, 'u').test(normalized)) {
    return false;
  }
  const period = options.periodSeconds ?? TOTP_PERIOD_SECONDS;
  const window = options.window ?? 1;
  const counter = timeCounter(options.nowMs ?? Date.now(), period);
  for (let drift = -window; drift <= window; drift += 1) {
    const candidate = generateHotp(hmac, secret, counter + drift, digits);
    if (timingSafeStringEqual(candidate, normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Build the standard `otpauth://totp/...` URI an authenticator app imports.
 * Caller passes a base32 secret (so we never re-encode/mangle it). The label is
 * `issuer:account`; query carries the secret, issuer, algorithm, digits, period.
 */
export function buildOtpAuthUri(input: {
  secretBase32: string;
  accountName: string;
  issuer: string;
  digits?: number;
  periodSeconds?: number;
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.accountName}`);
  const params = new URLSearchParams({
    secret: input.secretBase32,
    issuer: input.issuer,
    algorithm: TOTP_ALGORITHM,
    digits: String(input.digits ?? TOTP_DIGITS),
    period: String(input.periodSeconds ?? TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
