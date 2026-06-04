import { z } from 'zod';

// Shared, typed contracts for the enterprise-auth feature: TOTP MFA, tenant SSO
// (OIDC) config, and SCIM-style provisioning. Pure schemas/types only — no I/O,
// no secrets — so both the Angular client and both backends import one source
// of truth. Everything here defaults OFF; absence of config = today's behaviour.

// --- TOTP MFA ---------------------------------------------------------------

/** Per-member MFA state persisted on the member document. Never serialised to
 *  the client with the secret intact except in the one-time enrolment response. */
export const mfaStateSchema = z.object({
  enabled: z.boolean().default(false),
  /** base32 secret, present once enrolment starts; cleared when MFA is disabled. */
  secret: z.string().min(1).optional(),
  enrolledAt: z.string().optional(),
});
export type MfaState = z.infer<typeof mfaStateSchema>;

/** Body for verify-and-activate and for the second step at login. */
export const mfaCodeCommandSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/u, 'Enter the 6-digit code from your authenticator app.'),
});
export type MfaCodeCommand = z.infer<typeof mfaCodeCommandSchema>;

/** Response from begin-enrolment: the secret + otpauth URI the user scans/types. */
export interface MfaEnrollResponse {
  secret: string;
  otpauthUri: string;
  /** Echoed so the UI can render an "add ISO Audit (you@org)" hint. */
  account: string;
  issuer: string;
}

/** Login response when the account has MFA on: no token yet, a short-lived
 *  challenge the client exchanges for a token with the TOTP code. */
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
}

// --- SSO (OIDC) tenant config ----------------------------------------------

/** Tenant-level OIDC config. No client secret is stored in this document — the
 *  secret (for the real token exchange) is read from server env, keyed by tenant,
 *  so it never travels to the browser or sits in app data. */
export const ssoConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['oidc']).default('oidc'),
  /** Display name shown on the "Sign in with <name>" button. */
  displayName: z.string().min(1).max(120).default('SSO'),
  issuer: z.string().url('Issuer must be a full https URL.'),
  clientId: z.string().min(1).max(400),
  /** Optional explicit authorization endpoint; if absent the issuer's
   *  `${issuer}/authorize` convention is used by the initiate route. */
  authorizationEndpoint: z.string().url().optional(),
  /** Optional explicit token endpoint for the (scaffolded) code exchange. */
  tokenEndpoint: z.string().url().optional(),
  scopes: z.string().max(200).default('openid email profile'),
  updatedAt: z.string().optional(),
});
export type SsoConfig = z.infer<typeof ssoConfigSchema>;

/** Command to upsert a tenant's SSO config (tenantAdmin only). */
export const ssoConfigCommandSchema = ssoConfigSchema
  .omit({ updatedAt: true })
  .extend({ enabled: z.boolean().default(false) });
export type SsoConfigCommand = z.infer<typeof ssoConfigCommandSchema>;

/** Public, secret-free view of a tenant's SSO config for the login screen and
 *  the admin UI (the login screen needs only enabled + displayName). */
export interface SsoConfigView {
  enabled: boolean;
  provider: 'oidc';
  displayName: string;
  issuer: string;
  clientId: string;
  authorizationEndpoint?: string;
  scopes: string;
}

/** What the initiate route returns: the URL to redirect the browser to, plus
 *  the opaque `state` the client must echo back on callback (CSRF defence). */
export interface SsoInitiateResponse {
  authorizationUrl: string;
  state: string;
}

/** Build a public, secret-free SSO view from stored config (shared by backends). */
export function toSsoConfigView(config: SsoConfig): SsoConfigView {
  return {
    enabled: config.enabled,
    provider: config.provider,
    displayName: config.displayName,
    issuer: config.issuer,
    clientId: config.clientId,
    authorizationEndpoint: config.authorizationEndpoint,
    scopes: config.scopes,
  };
}

/**
 * Compose the OIDC authorization-redirect URL. Pure string-building — the
 * caller supplies the per-request `state` and `nonce`. This is REAL: the URL is
 * a spec-correct authorization request. The token exchange on callback is the
 * part that is scaffolded behind a server flag (see routes/edge function).
 */
export function buildAuthorizationUrl(input: {
  config: Pick<SsoConfig, 'issuer' | 'clientId' | 'authorizationEndpoint' | 'scopes'>;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const base = input.config.authorizationEndpoint ?? `${input.config.issuer.replace(/\/$/u, '')}/authorize`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.config.clientId,
    redirect_uri: input.redirectUri,
    scope: input.config.scopes || 'openid email profile',
    state: input.state,
    nonce: input.nonce,
  });
  return `${base}?${params.toString()}`;
}

// --- SCIM-style provisioning ------------------------------------------------

/** Minimal SCIM 2.0 User create/replace body we accept. We map the fields we
 *  need (externalId, userName/email, displayName, active) and ignore the rest. */
export const scimUserCommandSchema = z.object({
  schemas: z.array(z.string()).optional(),
  externalId: z.string().min(1).max(400),
  userName: z.string().min(1).max(400),
  active: z.boolean().default(true),
  name: z
    .object({ formatted: z.string().max(400).optional(), givenName: z.string().max(200).optional(), familyName: z.string().max(200).optional() })
    .optional(),
  displayName: z.string().max(400).optional(),
  emails: z
    .array(z.object({ value: z.string().email(), primary: z.boolean().optional(), type: z.string().optional() }))
    .optional(),
  /** Mapped to the member role; constrained to the tenant roles. Defaults to auditor. */
  role: z.enum(['tenantAdmin', 'leadAuditor', 'auditor', 'clientViewer']).optional(),
});
export type ScimUserCommand = z.infer<typeof scimUserCommandSchema>;

/** Resolve the email a SCIM payload is asserting (primary email, else userName). */
export function scimResolveEmail(command: ScimUserCommand): string | null {
  const primary = command.emails?.find((e) => e.primary) ?? command.emails?.[0];
  const candidate = (primary?.value ?? command.userName ?? '').toLowerCase().trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(candidate) ? candidate : null;
}

/** Resolve a display name from a SCIM payload (displayName, formatted, given+family, else local-part). */
export function scimResolveDisplayName(command: ScimUserCommand, email: string): string {
  const fromName = command.name?.formatted ?? [command.name?.givenName, command.name?.familyName].filter(Boolean).join(' ').trim();
  return (command.displayName ?? (fromName || '') ?? '').trim() || email.split('@')[0]!;
}

/** Shape a member document as a minimal SCIM User resource for responses. */
export function toScimUser(member: {
  uid: string;
  externalId?: string;
  email: string;
  displayName: string;
  active: boolean;
}): Record<string, unknown> {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: member.uid,
    externalId: member.externalId,
    userName: member.email,
    displayName: member.displayName,
    active: member.active,
    emails: [{ value: member.email, primary: true }],
  };
}
