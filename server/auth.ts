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

/**
 * Mint a short-lived MFA challenge token issued after a correct password when
 * the account has TOTP enabled. It carries `mfa: true` and the pending member's
 * identity but is NOT a session token: routes reject it everywhere except the
 * /auth/mfa/login step that exchanges it (plus a valid code) for a real token.
 */
export function issueMfaChallengeToken(member: { uid: string; tenantId: string; role: string }, config: ServerConfig): string {
  // 5-minute window to complete the second factor.
  return signJwt({ sub: member.uid, role: member.role, platform: false, tenantId: member.tenantId, mfa: true }, config.jwtSecret, 300);
}

/** Verify an MFA challenge token; returns the pending identity or throws. */
export function verifyMfaChallengeToken(token: string, config: ServerConfig): { uid: string; tenantId: string; role: string } {
  let claims;
  try {
    claims = verifyJwt(token, config.jwtSecret);
  } catch {
    throw new ApiAuthError('Invalid or expired MFA challenge.');
  }
  if (claims.mfa !== true || typeof claims.tenantId !== 'string') {
    throw new ApiAuthError('Invalid MFA challenge.');
  }
  return { uid: claims.sub, tenantId: claims.tenantId, role: claims.role };
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
