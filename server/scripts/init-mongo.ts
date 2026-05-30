import { ensureMongoIndexes, mongoCollections } from '../collections.js';
import { loadServerConfig } from '../config.js';
import { getMongoClient } from '../mongo.js';

async function main(): Promise<void> {
  const config = loadServerConfig();
  const client = await getMongoClient(config);
  const db = client.db(config.mongoDbName);

  await ensureMongoIndexes(db);

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: db.databaseName,
        collections: Object.values(mongoCollections),
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
