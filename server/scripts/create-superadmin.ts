import { randomUUID } from 'node:crypto';

import { ensureMongoIndexes, mongoCollections } from '../collections.js';
import { loadServerConfig } from '../config.js';
import { getMongoClient } from '../mongo.js';
import { issueSetPasswordToken } from '../set-password.js';

/**
 * Invite a platform superadmin. Creates (or refreshes) the account in an
 * `invited` state with NO password and prints a single-use set-password link —
 * the same secure flow used for every other account, so the person sets their
 * own password rather than being handed one.
 *
 *   npm run superadmin:invite -- "Jamil Jones" jamil@trainovations.com
 *
 * Falls back to SUPERADMIN_NAME / SUPERADMIN_EMAIL env vars when args are omitted.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function main(): Promise<void> {
  const displayName = (process.argv[2] ?? process.env['SUPERADMIN_NAME'] ?? '').trim();
  const email = (process.argv[3] ?? process.env['SUPERADMIN_EMAIL'] ?? '').toLowerCase().trim();

  if (!EMAIL_RE.test(email)) {
    console.error('Usage: npm run superadmin:invite -- "Full Name" email@example.com');
    process.exitCode = 1;
    return;
  }

  const config = loadServerConfig();
  const client = await getMongoClient(config);
  const db = client.db(config.mongoDbName);
  await ensureMongoIndexes(db);
  const members = db.collection(mongoCollections.members);

  const existing = await members.findOne({ 'profile.email': email });
  if (existing && existing['role'] !== 'platformSuperadmin') {
    console.error(`Refusing to convert an existing ${String(existing['role'])} account (${email}) into a superadmin.`);
    await client.close();
    process.exitCode = 1;
    return;
  }

  let uid: string;
  const now = new Date().toISOString();
  if (existing) {
    uid = String(existing['uid']);
    const profile = (existing['profile'] as { displayName?: string } | undefined) ?? {};
    await members.updateOne(
      { uid },
      {
        $set: {
          role: 'platformSuperadmin',
          // Don't reactivate a disabled account or wipe an existing password here;
          // only ensure brand-new (password-less) accounts are 'invited'.
          status: existing['passwordHash'] ? existing['status'] : 'invited',
          profile: { email, displayName: displayName || profile.displayName || 'Platform Superadmin' },
          updatedAt: now,
        },
      },
    );
  } else {
    uid = `uid-${randomUUID()}`;
    await members.insertOne({
      uid,
      tenantId: null,
      role: 'platformSuperadmin',
      status: 'invited',
      profile: { email, displayName: displayName || 'Platform Superadmin' },
      createdAt: now,
    });
  }

  const { link, expiresAt } = await issueSetPasswordToken(db, { uid, tenantId: null, email, purpose: 'invite' }, config);

  console.log(
    JSON.stringify(
      {
        ok: true,
        superadmin: { uid, email, displayName: displayName || 'Platform Superadmin', status: 'invited' },
        setPasswordLink: link,
        expiresAt,
        signInAt: `${config.appPublicUrl.replace(/\/+$/, '')}/admin/login`,
        next: 'Open setPasswordLink to choose a password, then sign in at signInAt.',
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
