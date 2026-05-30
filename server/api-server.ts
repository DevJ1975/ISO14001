import { createServer } from 'node:http';

import { ensureMongoIndexes } from './collections.js';
import { loadServerConfig } from './config.js';
import { getMongoDb } from './mongo.js';
import { handleApiRequest } from './routes.js';

async function main(): Promise<void> {
  const config = loadServerConfig();
  const db = await getMongoDb(config);
  await ensureMongoIndexes(db);

  const server = createServer((request, response) => {
    void handleApiRequest(request, response, { db, config });
  });

  server.listen(config.port, () => {
    console.log(`ISO 14001 MongoDB API listening on http://127.0.0.1:${config.port}`);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
