import { z } from 'zod';

import { roleSchema } from '../src/app/core/domain/index.js';
import { ServerConfig } from './config.js';
import { signJwt, verifyJwt } from './jwt.js';

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
  const authorization = firstHeader(request.headers.authorization);
  if (authorization?.startsWith('Bearer ')) {
    let claims;
    try {
      claims = verifyJwt(authorization.slice('Bearer '.length).trim(), config.jwtSecret);
    } catch {
      throw new ApiAuthError('Invalid or expired token.');
    }
    return actorContextSchema.parse({
      uid: claims.sub,
      tenantId: claims.tenantId,
      role: claims.role,
      platform: claims.platform === true,
    });
  }

  // Local-development convenience only; gated behind ALLOW_DEV_AUTH_HEADERS.
  if (config.allowDevAuthHeaders) {
    return actorContextSchema.parse({
      uid: firstHeader(request.headers['x-iso-actor-uid']),
      tenantId: firstHeader(request.headers['x-iso-tenant-id']),
      role: firstHeader(request.headers['x-iso-role']),
      platform: firstHeader(request.headers['x-iso-platform']) === 'true',
    });
  }

  throw new ApiAuthError('Missing bearer token.');
}

export function issueMemberToken(
  member: { uid: string; tenantId: string; role: string },
  config: ServerConfig,
): { token: string; expiresAt: string } {
  const token = signJwt(
    { sub: member.uid, role: member.role, platform: false, tenantId: member.tenantId },
    config.jwtSecret,
    config.jwtTtlSeconds,
  );
  return { token, expiresAt: new Date(Date.now() + config.jwtTtlSeconds * 1000).toISOString() };
}

/**
 * Mint a platform-superadmin token: `platform: true` and NO tenantId, matching
 * the discriminated actorContextSchema. Symmetric with issueMemberToken so the
 * platform/no-tenant invariant lives in exactly one place.
 */
export function issuePlatformToken(
  member: { uid: string },
  config: ServerConfig,
): { token: string; expiresAt: string } {
  const token = signJwt(
    { sub: member.uid, role: 'platformSuperadmin', platform: true },
    config.jwtSecret,
    config.jwtTtlSeconds,
  );
  return { token, expiresAt: new Date(Date.now() + config.jwtTtlSeconds * 1000).toISOString() };
}

/** Gate for the /api/admin/* surface. Tenant routes must keep using requireTenant. */
export function requireSuperadmin(actor: ActorContext): void {
  if (!actor.platform) {
    throw new ApiAuthError('Platform superadmin access is required.');
  }
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
