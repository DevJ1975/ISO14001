import { IncomingMessage, ServerResponse } from 'node:http';

import { loadServerConfig } from '../server/config.js';
import { getMongoDb } from '../server/mongo.js';
import { handleApiRequest } from '../server/routes.js';

export const config = {
  maxDuration: 30,
};

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const serverConfig = loadServerConfig();
    const db = await getMongoDb(serverConfig);
    await handleApiRequest(request, response, { db, config: serverConfig });
  } catch (error) {
    console.error(error);
    response.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({ ok: false, error: 'MongoDB connection is unavailable.' }));
  }
}
