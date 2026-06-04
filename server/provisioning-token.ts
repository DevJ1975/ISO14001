import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Db } from 'mongodb';

import { mongoCollections } from './collections.js';

/**
 * Tenant SCIM provisioning tokens. The raw bearer token is shown to the
 * tenantAdmin exactly once (at issue) and only its SHA-256 hash is persisted —
 * same primitive as set-password tokens (high-entropy → plain hash, not scrypt).
 * SCIM endpoints authenticate with `Authorization: Bearer <token>` matched
 * against the hash; the token is long-lived but revocable.
 */
export interface ProvisioningTokenRecord {
  id: string;
  tenantId: string;
  tokenHash: string;
  createdAt: string;
  createdByUid: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Issue a fresh provisioning token for a tenant, revoking any prior live token. */
export async function issueProvisioningToken(
  db: Db,
  input: { tenantId: string; createdByUid: string },
): Promise<{ token: string; createdAt: string }> {
  const collection = db.collection(mongoCollections.provisioningTokens);
  const now = new Date().toISOString();
  await collection.updateMany({ tenantId: input.tenantId, revokedAt: null }, { $set: { revokedAt: now } });
  const token = `scim_${randomBytes(32).toString('base64url')}`;
  const record: ProvisioningTokenRecord = {
    id: `pvt-${randomUUID()}`,
    tenantId: input.tenantId,
    tokenHash: hashToken(token),
    createdAt: now,
    createdByUid: input.createdByUid,
    revokedAt: null,
    lastUsedAt: null,
  };
  await collection.insertOne({ ...record });
  return { token, createdAt: now };
}

/** Resolve the tenant a SCIM bearer token authorises, or null if invalid/revoked. */
export async function resolveProvisioningToken(db: Db, token: string): Promise<{ tenantId: string } | null> {
  if (!token) return null;
  const collection = db.collection(mongoCollections.provisioningTokens);
  const record = (await collection.findOne({ tokenHash: hashToken(token), revokedAt: null })) as ProvisioningTokenRecord | null;
  if (!record) return null;
  await collection.updateOne({ id: record.id }, { $set: { lastUsedAt: new Date().toISOString() } });
  return { tenantId: record.tenantId };
}

/** Whether a tenant currently has a live provisioning token (for the admin UI). */
export async function hasProvisioningToken(db: Db, tenantId: string): Promise<boolean> {
  const record = await db.collection(mongoCollections.provisioningTokens).findOne({ tenantId, revokedAt: null });
  return record !== null;
}

/** Revoke all live provisioning tokens for a tenant. */
export async function revokeProvisioningTokens(db: Db, tenantId: string): Promise<void> {
  await db
    .collection(mongoCollections.provisioningTokens)
    .updateMany({ tenantId, revokedAt: null }, { $set: { revokedAt: new Date().toISOString() } });
}
