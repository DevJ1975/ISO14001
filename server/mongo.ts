import { Db, MongoClient } from 'mongodb';

import { loadServerConfig, ServerConfig } from './config.js';

let clientPromise: Promise<MongoClient> | null = null;

export function createMongoClient(config: ServerConfig): MongoClient {
  return new MongoClient(config.mongoUri, {
    connectTimeoutMS: 5_000,
    maxPoolSize: 50,
    maxConnecting: 4,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 5_000,
    waitQueueTimeoutMS: 5_000,
  });
}

export async function getMongoClient(config: ServerConfig = loadServerConfig()): Promise<MongoClient> {
  clientPromise ??= createMongoClient(config).connect();
  return clientPromise;
}

export async function getMongoDb(config: ServerConfig = loadServerConfig()): Promise<Db> {
  const client = await getMongoClient(config);
  return client.db(config.mongoDbName);
}

export function resetMongoClientForTests(): void {
  clientPromise = null;
}
