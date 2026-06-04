import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Db } from 'mongodb';

import { mongoCollections } from './collections.js';
import { ServerConfig } from './config.js';
import { buildSetPasswordLink } from './mailer.js';

/**
 * Single-use, time-limited set-password tokens. The raw token travels only in the
 * emailed link; we persist only its SHA-256 hash (the token is high-entropy, so a
 * plain hash is the right primitive — scrypt is for low-entropy passwords). Tokens
 * are consumed atomically so a link works exactly once, and expiry is checked in
 * code (a background job can prune the `expiresAt` index).
 */
export type SetPasswordPurpose = 'invite' | 'reset';

export interface SetPasswordTokenRecord {
  id: string;
  tokenHash: string;
  uid: string;
  tenantId: string | null;
  email: string;
  purpose: SetPasswordPurpose;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a fresh token for a member, superseding any prior unconsumed token for the
 * same (uid, purpose) so a re-send invalidates the old link. Returns the raw token
 * and the ready-to-email link.
 */
export async function issueSetPasswordToken(
  db: Db,
  input: { uid: string; tenantId: string | null; email: string; purpose: SetPasswordPurpose },
  config: ServerConfig,
): Promise<{ token: string; link: string; expiresAt: string }> {
  const collection = db.collection(mongoCollections.setPasswordTokens);
  const now = new Date();
  await collection.updateMany(
    { uid: input.uid, purpose: input.purpose, consumedAt: null },
    { $set: { consumedAt: now.toISOString() } },
  );
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + config.setPasswordTtlSeconds * 1000).toISOString();
  const record: SetPasswordTokenRecord = {
    id: `spt-${randomUUID()}`,
    tokenHash: hashToken(token),
    uid: input.uid,
    tenantId: input.tenantId,
    email: input.email,
    purpose: input.purpose,
    createdAt: now.toISOString(),
    expiresAt,
    consumedAt: null,
  };
  await collection.insertOne(record);
  return { token, link: buildSetPasswordLink(config, token), expiresAt };
}

/**
 * Validation-only lookup for the set-password page. Returns a uniform
 * `{ valid: false }` for any missing/expired/consumed token so the endpoint can't
 * be used to enumerate accounts; reveals display context only for a live token.
 */
export async function describeSetPasswordToken(
  db: Db,
  token: string,
): Promise<{ valid: false } | { valid: true; email: string; purpose: SetPasswordPurpose }> {
  const record = (await db
    .collection(mongoCollections.setPasswordTokens)
    .findOne({ tokenHash: hashToken(token) }, { projection: { _id: 0 } })) as SetPasswordTokenRecord | null;
  if (!record || record.consumedAt || new Date(record.expiresAt).getTime() < Date.now()) {
    return { valid: false };
  }
  return { valid: true, email: record.email, purpose: record.purpose };
}

/**
 * Atomically consume a token (single use, race-safe). Throws on
 * missing/expired/already-used tokens. Returns the identity to set the password for.
 */
export async function consumeSetPasswordToken(
  db: Db,
  token: string,
): Promise<{ uid: string; tenantId: string | null; email: string; purpose: SetPasswordPurpose }> {
  const collection = db.collection(mongoCollections.setPasswordTokens);
  const tokenHash = hashToken(token);
  const record = (await collection.findOne({ tokenHash }, { projection: { _id: 0 } })) as SetPasswordTokenRecord | null;
  if (!record) throw new SetPasswordTokenError('This link is invalid.');
  if (new Date(record.expiresAt).getTime() < Date.now()) throw new SetPasswordTokenError('This link has expired.');
  const claim = await collection.updateOne({ tokenHash, consumedAt: null }, { $set: { consumedAt: new Date().toISOString() } });
  if (claim.modifiedCount !== 1) throw new SetPasswordTokenError('This link has already been used.');
  return { uid: record.uid, tenantId: record.tenantId, email: record.email, purpose: record.purpose };
}

/** Revoke all live links for a member (e.g. a leaked invite) without disabling the account. */
export async function revokeSetPasswordTokens(db: Db, uid: string): Promise<void> {
  await db
    .collection(mongoCollections.setPasswordTokens)
    .updateMany({ uid, consumedAt: null }, { $set: { consumedAt: new Date().toISOString() } });
}

export class SetPasswordTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetPasswordTokenError';
  }
}
