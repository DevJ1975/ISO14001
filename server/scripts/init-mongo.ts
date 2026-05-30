import { ensureMongoIndexes, mongoCollections } from '../collections.js';
import { loadServerConfig } from '../config.js';
import { getMongoClient } from '../mongo.js';
import { hashPassword } from '../password.js';

const DEMO_TENANT_ID = 'tenant-greenline';
const DEMO_UID = 'uid-ava-auditor';
const DEMO_EMAIL = 'ava.brooks@example-audit.test';
const DEMO_PASSWORD = process.env['DEMO_AUDITOR_PASSWORD'] ?? 'audit-demo-2026';

async function main(): Promise<void> {
  const config = loadServerConfig();
  const client = await getMongoClient(config);
  const db = client.db(config.mongoDbName);

  await ensureMongoIndexes(db);

  const now = new Date().toISOString();
  await db.collection(mongoCollections.tenants).updateOne(
    { id: DEMO_TENANT_ID },
    {
      $setOnInsert: {
        id: DEMO_TENANT_ID,
        name: 'Greenline Assurance',
        plan: 'pilot',
        status: 'active',
        createdAt: now,
      },
    },
    { upsert: true },
  );

  await db.collection(mongoCollections.members).updateOne(
    { tenantId: DEMO_TENANT_ID, uid: DEMO_UID },
    {
      $set: { passwordHash: hashPassword(DEMO_PASSWORD) },
      $setOnInsert: {
        uid: DEMO_UID,
        tenantId: DEMO_TENANT_ID,
        role: 'leadAuditor',
        status: 'active',
        profile: { email: DEMO_EMAIL, displayName: 'Ava Brooks' },
        createdAt: now,
      },
    },
    { upsert: true },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: db.databaseName,
        collections: Object.values(mongoCollections),
        demoLogin: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
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
