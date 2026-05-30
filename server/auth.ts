import { z } from 'zod';

import { roleSchema } from '../src/app/core/domain/index.js';
import { ServerConfig } from './config.js';

export const actorContextSchema = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal(true),
    uid: z.string().min(1),
    role: z.literal('platformSuperadmin'),
    tenantId: z.never().optional(),
  }),
  z.object({
    platform: z.literal(false),
    uid: z.string().min(1),
    role: roleSchema.exclude(['platformSuperadmin']),
    tenantId: z.string().min(1),
  }),
]);

export type ActorContext = z.infer<typeof actorContextSchema>;

export class ApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export interface HeaderReader {
  readonly headers: {
    readonly authorization?: string | string[];
    readonly ['x-iso-actor-uid']?: string | string[];
    readonly ['x-iso-tenant-id']?: string | string[];
    readonly ['x-iso-role']?: string | string[];
    readonly ['x-iso-platform']?: string | string[];
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function authenticateRequest(request: HeaderReader, config: ServerConfig): ActorContext {
  if (config.allowDevAuthHeaders) {
    return actorContextSchema.parse({
      uid: firstHeader(request.headers['x-iso-actor-uid']),
      tenantId: firstHeader(request.headers['x-iso-tenant-id']),
      role: firstHeader(request.headers['x-iso-role']),
      platform: firstHeader(request.headers['x-iso-platform']) === 'true',
    });
  }

  if (!firstHeader(request.headers.authorization)?.startsWith('Bearer ')) {
    throw new ApiAuthError('Missing bearer token.');
  }

  throw new ApiAuthError('Production JWT verification is not configured yet.');
}

export function requireTenant(actor: ActorContext, tenantId: string): void {
  if (actor.platform || actor.tenantId !== tenantId) {
    throw new ApiAuthError('Actor is not scoped to this tenant.');
  }
}

export function requireAnyRole(actor: ActorContext, roles: ActorContext['role'][]): void {
  if (!roles.includes(actor.role)) {
    throw new ApiAuthError('Actor role is not allowed for this operation.');
  }
}
