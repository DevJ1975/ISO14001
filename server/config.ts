import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';

// Note: z.coerce.boolean() treats any non-empty string as true, so the string
// "false" would (surprisingly) become true. Parse the flag explicitly instead.
const booleanFlagSchema = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value) => value === true || value === 'true' || value === '1');

export const DEV_JWT_SECRET = 'dev-insecure-jwt-secret-change-me';

export const serverConfigSchema = z.object({
  mongoUri: z.string().min(1),
  mongoDbName: z.string().min(1).default('iso14001_auditor'),
  port: z.coerce.number().int().positive().default(4300),
  corsOrigin: z.string().min(1).default('http://127.0.0.1:4200'),
  allowDevAuthHeaders: booleanFlagSchema,
  jwtSecret: z.string().min(1).default(DEV_JWT_SECRET),
  jwtTtlSeconds: z.coerce.number().int().positive().default(43200),
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
    jwtSecret: env['JWT_SECRET'],
    jwtTtlSeconds: env['JWT_TTL_SECONDS'],
  });
}
