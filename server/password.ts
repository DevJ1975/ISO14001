import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Dependency-free password hashing with scrypt. Format: scrypt$<saltHex>$<hashHex>.

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  if (expected.length === 0) {
    return false;
  }
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
