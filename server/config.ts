import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';

export const serverConfigSchema = z.object({
  mongoUri: z.string().min(1),
  mongoDbName: z.string().min(1).default('iso14001_auditor'),
  port: z.coerce.number().int().positive().default(4300),
  corsOrigin: z.string().min(1).default('http://127.0.0.1:4200'),
  allowDevAuthHeaders: z.coerce.boolean().default(false),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

function readLocalDotEnv(): Record<string, string> {
  if (!existsSync('.env')) {
    return {};
  }

  return readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return values;
      }

      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        return values;
      }

      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      values[key] = rawValue.replace(/^['"]|['"]$/g, '');
      return values;
    }, {});
}

export function loadServerConfig(env: Record<string, string | undefined> = { ...readLocalDotEnv(), ...process.env }): ServerConfig {
  return serverConfigSchema.parse({
    mongoUri: env['MONGODB_URI'],
    mongoDbName: env['MONGODB_DB_NAME'],
    port: env['PORT'],
    corsOrigin: env['CORS_ORIGIN'],
    allowDevAuthHeaders: env['ALLOW_DEV_AUTH_HEADERS'],
  });
}
