// Supabase Edge Function: ISO 45001 audit API.
// Mirrors the original Node/Mongo `/api` contract over Postgres JSONB tables.
// Custom auth (HS256 app JWT + PBKDF2 passwords via Web Crypto); deployed with
// verify_jwt=false so the app's own bearer token passes through unmodified.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  cleanCapa,
  cleanEvidenceRequest,
  cleanFinding,
  cleanProvisionClient,
  cleanRegister,
  isAuthConfigured,
  mergeAuditeeEvidenceRequest,
  requireId,
  resolveCorsOrigin,
  ValidationError,
} from './_validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// SECURITY: the app JWT must be signed with a dedicated secret. We deliberately
// do NOT fall back to the service-role key — doing so means anyone holding that
// (widely distributed) key could forge admin tokens. If APP_JWT_SECRET is unset
// the function refuses to sign/verify tokens (auth endpoints return 503) rather
// than silently degrade to an insecure mode.
const JWT_SECRET = Deno.env.get('APP_JWT_SECRET') ?? '';
const JWT_TTL = 43200;

// Client-portal / superadmin provisioning config.
const APP_PUBLIC_URL = (Deno.env.get('APP_PUBLIC_URL') ?? '').replace(/\/+$/, '');
// Return raw set-password links in API responses (dev/admin convenience). Keep
// off in production so links are delivered only via the emailed message.
const EXPOSE_SET_PASSWORD_LINK = (Deno.env.get('EXPOSE_SET_PASSWORD_LINK') ?? '') === 'true';
// Secret that gates the one-time first-superadmin bootstrap endpoint.
const SUPERADMIN_BOOTSTRAP_SECRET = Deno.env.get('SUPERADMIN_BOOTSTRAP_SECRET') ?? '';
const SET_PASSWORD_TTL_MS = 72 * 60 * 60 * 1000;
// Sentinel tenant for the tenant-less platform superadmin (avoids a null PK).
const PLATFORM_TENANT = 'platform';

// SECURITY: lock CORS to an explicit allow-list of app origins (comma-separated
// in APP_ALLOWED_ORIGINS). The deployed function runs with verify_jwt=false, so
// a wildcard origin would let any site call the API with a victim's token.
const ALLOWED_ORIGINS = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(req) {
  const origin = req?.headers?.get('origin') ?? '';
  return {
    'access-control-allow-origin': resolveCorsOrigin(origin, ALLOWED_ORIGINS),
    'access-control-allow-headers': 'authorization,content-type,apikey,x-app-token',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'vary': 'Origin',
  };
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// `req` is optional: when omitted, corsHeaders() emits the first configured
// app origin (never a wildcard), which is correct for the single-origin app.
function json(status, body, req) {
  return new Response(body === null ? 'null' : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json; charset=utf-8' },
  });
}

const enc = new TextEncoder();
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
  const bin = atob(norm + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function hmacKey(secret) {
  return await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signJwt(payload) {
  if (!isAuthConfigured(JWT_SECRET)) throw new AuthError('Auth is not configured (APP_JWT_SECRET missing).');
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + JWT_TTL;
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: nowSec, exp })));
  const data = `${header}.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(JWT_SECRET), enc.encode(data)));
  return { token: `${data}.${b64url(sig)}`, exp };
}
async function verifyJwt(token) {
  if (!isAuthConfigured(JWT_SECRET)) throw new Error('not configured');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('malformed');
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(JWT_SECRET), b64urlToBytes(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('signature');
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
  return payload;
}
async function verifyPassword(password, stored) {
  const [scheme, itStr, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const iterations = parseInt(itStr, 10);
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, expected.length * 8),
  );
  return timingSafeEqual(bits, expected);
}
function bytesToHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
async function hashPassword(password) {
  const iterations = 100000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256),
  );
  return `pbkdf2$${iterations}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}
// A readable, URL-safe one-time password the admin/lead shares out-of-band.
function tempPassword() {
  return b64url(crypto.getRandomValues(new Uint8Array(9)));
}

// --- Enterprise auth: TOTP (RFC 6238) over Web Crypto HMAC-SHA1 -------------
// Mirrors src/app/core/domain/totp.ts. Kept inline because edge functions can't
// import the Node-built domain bundle, but the algorithm + vectors are identical.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(input) {
  const cleaned = String(input).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('bad base32');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Uint8Array.from(out);
}
function counterBytes(counter) {
  const bytes = new Uint8Array(8); let v = Math.floor(counter);
  for (let i = 7; i >= 0; i--) { bytes[i] = v & 0xff; v = Math.floor(v / 256); }
  return bytes;
}
async function hmacSha1(keyBytes, msg) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
}
function truncate(digest, digits = 6) {
  const offset = digest[digest.length - 1] & 0x0f;
  const bin = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}
function generateMfaSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}
function mfaOtpAuthUri(secretBase32, account, issuer = 'ISO Audit') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
async function verifyMfaCode(secretBase32, code) {
  const normalized = String(code ?? '').trim();
  if (!/^[0-9]{6}$/.test(normalized)) return false;
  let secret;
  try { secret = base32Decode(secretBase32); } catch { return false; }
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let drift = -1; drift <= 1; drift++) {
    const digest = await hmacSha1(secret, counterBytes(counter + drift));
    if (timingSafeEqual(enc.encode(truncate(digest)), enc.encode(normalized))) return true;
  }
  return false;
}

// A short-lived (5-minute) MFA challenge token: a session-shaped JWT marked mfa:true.
async function signMfaChallenge(member) {
  if (!isAuthConfigured(JWT_SECRET)) throw new AuthError('Auth is not configured (APP_JWT_SECRET missing).');
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + 300;
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify({ sub: member.uid, tenantId: member.tenant_id, role: member.role, platform: false, mfa: true, iat: nowSec, exp })));
  const data = `${header}.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(JWT_SECRET), enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

function sha256Hex(input) {
  return crypto.subtle.digest('SHA-256', enc.encode(input)).then((buf) => bytesToHex(new Uint8Array(buf)));
}

// Spec-correct OIDC authorization-redirect URL (mirrors buildAuthorizationUrl).
function buildAuthorizationUrl(doc, redirectUri, state, nonce) {
  const base = doc.authorizationEndpoint ?? `${String(doc.issuer).replace(/\/$/, '')}/authorize`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: doc.clientId,
    redirect_uri: redirectUri,
    scope: doc.scopes || 'openid email profile',
    state,
    nonce,
  });
  return `${base}?${params.toString()}`;
}

const SSO_CALLBACK_BASE_URL = Deno.env.get('SSO_CALLBACK_BASE_URL') ?? (ALLOWED_ORIGINS[0] ?? '');
const SSO_LIVE_EXCHANGE = (Deno.env.get('SSO_LIVE_EXCHANGE') ?? '') === 'true';
// Public shape of a member — never leaks the password hash.
function toMember(row) {
  return {
    uid: row.uid,
    email: row.email,
    role: row.role,
    displayName: row.display_name ?? '',
    status: row.status ?? 'active',
  };
}
const TENANT_ROLES = ['tenantAdmin', 'leadAuditor', 'auditor', 'clientViewer'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// In-memory login throttle (per email+IP). Edge functions can be multi-instance,
// so this is best-effort defense-in-depth; pair with a platform/WAF rate limit.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
function loginRateLimited(key) {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) return false;
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}
function recordLoginFailure(key) {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) loginAttempts.set(key, { count: 1, firstAt: Date.now() });
  else entry.count += 1;
}

// Append an immutable change-log entry as a field record (best-effort).
async function logChange(tenantId, auditId, actorUid, action, target, targetId) {
  try {
    const id = `chg-${crypto.randomUUID()}`;
    await upsertRecord(tenantId, auditId, 'change', id, { id, actorUid, action, target, targetId, at: new Date().toISOString() });
  } catch {
    // never let audit logging break the request it records
  }
}

class AuthError extends Error {}

async function getActor(req) {
  const authz = req.headers.get('authorization') ?? req.headers.get('x-app-token') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : authz.trim();
  if (!token) throw new AuthError('Missing token');
  let claims;
  try {
    claims = await verifyJwt(token);
  } catch {
    throw new AuthError('Invalid or expired token');
  }
  return {
    uid: String(claims.sub ?? ''),
    tenantId: String(claims.tenantId ?? ''),
    role: String(claims.role ?? ''),
    platform: claims.platform === true,
  };
}
function requireTenant(actor, tenantId) {
  if (actor.platform || actor.tenantId !== tenantId) throw new AuthError('Wrong tenant');
}
function requireRole(actor, roles) {
  if (!roles.includes(actor.role)) throw new AuthError('Role not allowed');
}
// Platform-superadmin gate for /admin/*. Tenant routes keep using requireTenant,
// which (by design) rejects platform tokens.
function requireSuperadmin(actor) {
  if (!actor.platform) throw new AuthError('Platform superadmin access is required.');
}

// --- Set-password links + email seam -------------------------------------
function buildSetPasswordLink(token) {
  return `${APP_PUBLIC_URL}/set-password?token=${encodeURIComponent(token)}`;
}
// Email seam: logs by default. A real provider (SMTP/Resend/SES) plugs in here.
async function sendInviteEmail(to, link, tenantName, purpose) {
  const subject = purpose === 'reset' ? 'Reset your Soteria Signum password' : `You've been added to ${tenantName} on Soteria Signum`;
  try {
    console.log(`[email] to=${to} subject=${JSON.stringify(subject)}\n${link}`);
  } catch {
    /* logging must never throw */
  }
}
async function issueSetPasswordToken(uid, tenantId, email, purpose) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  // Supersede any prior live link for this (uid, purpose) so a re-send revokes the old one.
  await db.from('set_password_tokens').update({ consumed_at: now.toISOString() }).eq('uid', uid).eq('purpose', purpose).is('consumed_at', null);
  await db.from('set_password_tokens').insert({
    id: `spt-${crypto.randomUUID()}`,
    token_hash: tokenHash,
    uid,
    tenant_id: tenantId,
    email,
    purpose,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SET_PASSWORD_TTL_MS).toISOString(),
    consumed_at: null,
  });
  return { token, link: buildSetPasswordLink(token) };
}
async function describeSetPasswordToken(token) {
  const tokenHash = await sha256Hex(token);
  const { data } = await db.from('set_password_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (!data || data.consumed_at || new Date(data.expires_at).getTime() < Date.now()) return { valid: false };
  return { valid: true, email: data.email, purpose: data.purpose, platform: data.tenant_id === PLATFORM_TENANT };
}
async function consumeSetPasswordToken(token) {
  const tokenHash = await sha256Hex(token);
  const { data } = await db.from('set_password_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (!data) throw new ValidationError('This link is invalid.');
  if (new Date(data.expires_at).getTime() < Date.now()) throw new ValidationError('This link has expired.');
  // Single-use: only the request that flips consumed_at from null wins.
  const { data: claimed } = await db
    .from('set_password_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .select('id');
  if (!claimed || claimed.length !== 1) throw new ValidationError('This link has already been used.');
  return { uid: data.uid, tenantId: data.tenant_id, email: data.email, purpose: data.purpose };
}
async function tenantNameFor(tenantId) {
  const { data } = await db.from('tenants').select('doc').eq('id', tenantId).maybeSingle();
  return data?.doc?.name ?? tenantId;
}
// Create an `invited` member (no password) + emailed set-password link. Caller
// must have already checked the email is free.
async function createInvitedMember({ tenantId, tenantName, role, email, displayName }) {
  const normalized = email.toLowerCase().trim();
  const uid = `uid-${crypto.randomUUID()}`;
  const doc = {
    tenant_id: tenantId,
    uid,
    email: normalized,
    role,
    display_name: (displayName ?? '').trim() || normalized.split('@')[0],
    status: 'invited',
  };
  const { error } = await db.from('members').insert(doc);
  if (error) throw new ValidationError('Could not create the user.');
  const { link } = await issueSetPasswordToken(uid, tenantId, normalized, 'invite');
  await sendInviteEmail(normalized, link, tenantName, 'invite');
  return { member: toMember(doc), link };
}

async function listRecords(tenantId, auditId) {
  const { data } = await db.from('field_records').select('kind,doc').eq('tenant_id', tenantId).eq('audit_id', auditId);
  return data ?? [];
}
async function getRecord(tenantId, auditId, kind, recordId) {
  const { data } = await db
    .from('field_records')
    .select('doc')
    .eq('tenant_id', tenantId)
    .eq('audit_id', auditId)
    .eq('kind', kind)
    .eq('record_id', recordId)
    .maybeSingle();
  return data?.doc ?? null;
}
async function upsertRecord(tenantId, auditId, kind, recordId, doc) {
  await db
    .from('field_records')
    .upsert(
      { tenant_id: tenantId, audit_id: auditId, kind, record_id: recordId, doc, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,audit_id,kind,record_id' },
    );
}

// A fresh audit starts with the three top-level ISO 45001 clause checklist rows.
function starterChecklist() {
  const now = new Date().toISOString();
  return [
    { id: 'item-4', clauseId: '4', clauseTitle: 'Context of the organization', question: 'Verify internal/external OHSMS context and interested parties.', ownerName: '', result: 'notStarted', evidenceIds: [], updatedAt: now },
    { id: 'item-6', clauseId: '6', clauseTitle: 'Planning', question: 'Sample hazards, OH&S risks, legal & other requirements and objectives.', ownerName: '', result: 'notStarted', evidenceIds: [], updatedAt: now },
    { id: 'item-8', clauseId: '8', clauseTitle: 'Operation', question: 'Observe operational controls and emergency preparedness.', ownerName: '', result: 'notStarted', evidenceIds: [], updatedAt: now },
  ];
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/api/, '').replace(/^\/api/, '') || '/';
  const seg = path.split('/').filter(Boolean);
  const method = req.method;

  try {
    if (method === 'GET' && seg[0] === 'health') {
      const { error } = await db.from('members').select('uid').limit(1);
      return json(200, { ok: !error, backend: 'supabase' });
    }

    if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'login') {
      const body = await readJson(req);
      const email = String(body.email ?? '').toLowerCase().trim();
      const password = String(body.password ?? '');
      const clientIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'edge';
      const rateKey = `${email}|${clientIp}`;
      if (loginRateLimited(rateKey)) {
        return json(429, { error: 'Too many failed sign-in attempts. Try again later.' }, req);
      }
      const { data: member } = await db.from('members').select('*').ilike('email', email).maybeSingle();
      if (
        !member ||
        member.status !== 'active' ||
        typeof member.password_hash !== 'string' ||
        !(await verifyPassword(password, member.password_hash))
      ) {
        recordLoginFailure(rateKey);
        return json(401, { error: 'Invalid email or password.' }, req);
      }
      loginAttempts.delete(rateKey);
      // Opt-in TOTP MFA: when enabled, return a short-lived challenge instead of a token.
      const mfa = member.mfa ?? {};
      if (mfa.enabled === true) {
        const challengeToken = await signMfaChallenge(member);
        return json(200, { mfaRequired: true, challengeToken }, req);
      }
      const { token, exp } = await signJwt({ sub: member.uid, tenantId: member.tenant_id, role: member.role, platform: false });
      return json(200, {
        token,
        expiresAt: new Date(exp * 1000).toISOString(),
        user: { uid: member.uid, tenantId: member.tenant_id, role: member.role, displayName: member.display_name, email: member.email },
      });
    }

    // Dedicated platform-superadmin sign-in: mints a tenant-less platform token.
    if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'superadmin-login') {
      const body = await readJson(req);
      const email = String(body.email ?? '').toLowerCase().trim();
      const password = String(body.password ?? '');
      const clientIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'edge';
      const rateKey = `superadmin|${email}|${clientIp}`;
      if (loginRateLimited(rateKey)) return json(429, { error: 'Too many failed sign-in attempts. Try again later.' }, req);
      const { data: member } = await db.from('members').select('*').ilike('email', email).maybeSingle();
      if (
        !member ||
        member.role !== 'platformSuperadmin' ||
        member.status !== 'active' ||
        typeof member.password_hash !== 'string' ||
        !(await verifyPassword(password, member.password_hash))
      ) {
        recordLoginFailure(rateKey);
        return json(401, { error: 'Invalid email or password.' }, req);
      }
      loginAttempts.delete(rateKey);
      const { token, exp } = await signJwt({ sub: member.uid, role: 'platformSuperadmin', platform: true });
      return json(200, {
        token,
        expiresAt: new Date(exp * 1000).toISOString(),
        user: { uid: member.uid, tenantId: null, role: 'platformSuperadmin', displayName: member.display_name, email: member.email },
      }, req);
    }

    // One-time, secret-gated first-superadmin bootstrap. Self-disables once any
    // superadmin exists. Creates the account 'invited' and returns/sends a
    // set-password link so the operator chooses their own password.
    if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'superadmin-bootstrap') {
      const body = await readJson(req);
      if (!SUPERADMIN_BOOTSTRAP_SECRET || String(body.secret ?? '') !== SUPERADMIN_BOOTSTRAP_SECRET) {
        return json(403, { error: 'Bootstrap is not enabled.' }, req);
      }
      const { data: anySuper } = await db.from('members').select('uid').eq('role', 'platformSuperadmin').limit(1);
      if ((anySuper ?? []).length > 0) return json(409, { error: 'A superadmin already exists.' }, req);
      const email = String(body.email ?? '').toLowerCase().trim();
      const displayName = String(body.displayName ?? '').trim() || 'Platform Superadmin';
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' }, req);
      const uid = `uid-${crypto.randomUUID()}`;
      const { error } = await db.from('members').insert({ tenant_id: PLATFORM_TENANT, uid, email, role: 'platformSuperadmin', display_name: displayName, status: 'invited' });
      if (error) return json(500, { error: 'Could not create the superadmin.' }, req);
      const { link } = await issueSetPasswordToken(uid, PLATFORM_TENANT, email, 'invite');
      await sendInviteEmail(email, link, 'Platform', 'invite');
      return json(201, { ok: true, email, setPasswordLink: EXPOSE_SET_PASSWORD_LINK ? link : undefined }, req);
    }

    // Public set-password page lookup (generic invalid → no account enumeration).
    if (method === 'GET' && seg[0] === 'auth' && seg[1] === 'set-password' && seg[2]) {
      return json(200, await describeSetPasswordToken(seg[2]), req);
    }
    // Public set-password consume: single-use, activates the account.
    if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'set-password' && !seg[2]) {
      const body = await readJson(req);
      const token = String(body.token ?? '');
      const password = String(body.password ?? '');
      if (password.length < 8) return json(400, { error: 'New password must be at least 8 characters.' }, req);
      const id = await consumeSetPasswordToken(token);
      await db
        .from('members')
        .update({ password_hash: await hashPassword(password), status: 'active' })
        .eq('tenant_id', id.tenantId)
        .eq('uid', id.uid);
      return json(200, { ok: true }, req);
    }

    // --- Platform superadmin console (/admin/*) -----------------------------
    if (seg[0] === 'admin' && seg[1] === 'tenants') {
      const actor = await getActor(req);
      requireSuperadmin(actor);

      // Onboard a client: tenant + lead auditor + client users, in one call.
      if (method === 'POST' && seg.length === 2) {
        const body = await readJson(req);
        const cmd = cleanProvisionClient(body);
        const idem = String(body.idempotencyKey ?? '');
        if (idem) {
          const { data: prior } = await db.from('tenants').select('id').eq('idempotency_key', idem).maybeSingle();
          if (prior) return json(200, { tenantId: prior.id, idempotent: true, members: [] }, req);
        }
        const tenantId = `tenant-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await db.from('tenants').insert({
          id: tenantId,
          idempotency_key: idem || null,
          doc: { id: tenantId, name: cmd.tenantName, plan: cmd.plan, status: 'active', createdAt: now },
          created_at: now,
        });
        const members = [];
        for (const u of [{ ...cmd.leadAuditor, role: 'leadAuditor' }, ...cmd.clientUsers]) {
          const { data: existing } = await db.from('members').select('uid').ilike('email', u.email).maybeSingle();
          if (existing) continue; // idempotent: skip an email already on the platform
          const { member, link } = await createInvitedMember({ tenantId, tenantName: cmd.tenantName, role: u.role, email: u.email, displayName: u.displayName });
          members.push({ ...member, tenantId, setPasswordLink: EXPOSE_SET_PASSWORD_LINK ? link : undefined });
          await logChange(tenantId, PLATFORM_TENANT, actor.uid, 'member.invite', 'member', member.uid);
        }
        await logChange(tenantId, PLATFORM_TENANT, actor.uid, 'tenant.provision', 'tenant', tenantId);
        return json(201, { tenantId, members }, req);
      }

      if (method === 'GET' && seg.length === 2) {
        const { data: tenants } = await db.from('tenants').select('doc').order('created_at', { ascending: false });
        const { data: allMembers } = await db.from('members').select('tenant_id');
        const counts = {};
        for (const m of allMembers ?? []) counts[m.tenant_id] = (counts[m.tenant_id] ?? 0) + 1;
        return json(200, { tenants: (tenants ?? []).map((t) => ({ ...t.doc, memberCount: counts[t.doc.id] ?? 0 })) }, req);
      }

      const tenantId = seg[2];
      // /admin/tenants/:t/members ...
      if (seg[3] === 'members') {
        const targetUid = seg[4];
        if (method === 'GET' && !targetUid) {
          const { data } = await db.from('members').select('uid,email,role,display_name,status,created_at,tenant_id').eq('tenant_id', tenantId).order('created_at', { ascending: true });
          return json(200, { members: (data ?? []).map((m) => ({ ...toMember(m), tenantId: m.tenant_id })) }, req);
        }
        if (method === 'POST' && !targetUid) {
          const body = await readJson(req);
          const email = String(body.email ?? '').toLowerCase().trim();
          const role = TENANT_ROLES.includes(String(body.role)) ? String(body.role) : 'clientViewer';
          if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' }, req);
          const { data: existing } = await db.from('members').select('uid').ilike('email', email).maybeSingle();
          if (existing) return json(409, { error: 'A user with that email already exists.' }, req);
          const { member, link } = await createInvitedMember({ tenantId, tenantName: await tenantNameFor(tenantId), role, email, displayName: String(body.displayName ?? '') });
          return json(201, { member: { ...member, tenantId }, setPasswordLink: EXPOSE_SET_PASSWORD_LINK ? link : undefined }, req);
        }
        if (targetUid && method === 'POST' && (seg[5] === 'resend' || seg[5] === 'revoke')) {
          const { data: target } = await db.from('members').select('uid,email,display_name').eq('tenant_id', tenantId).eq('uid', targetUid).maybeSingle();
          if (!target) return json(404, { error: 'User not found.' }, req);
          if (seg[5] === 'revoke') {
            await db.from('set_password_tokens').update({ consumed_at: new Date().toISOString() }).eq('uid', targetUid).is('consumed_at', null);
            await logChange(tenantId, PLATFORM_TENANT, actor.uid, 'link.revoke', 'member', targetUid);
            return json(200, { ok: true }, req);
          }
          const { link } = await issueSetPasswordToken(targetUid, tenantId, target.email, 'invite');
          await sendInviteEmail(target.email, link, await tenantNameFor(tenantId), 'invite');
          await logChange(tenantId, PLATFORM_TENANT, actor.uid, 'link.resend', 'member', targetUid);
          return json(200, { ok: true, setPasswordLink: EXPOSE_SET_PASSWORD_LINK ? link : undefined }, req);
        }
        if (targetUid && method === 'PUT' && !seg[5]) {
          const body = await readJson(req);
          if (!['active', 'disabled'].includes(String(body.status))) return json(400, { error: 'Unknown status.' }, req);
          const { error } = await db.from('members').update({ status: body.status }).eq('tenant_id', tenantId).eq('uid', targetUid);
          if (error) return json(500, { error: 'Could not update the user.' }, req);
          await logChange(tenantId, PLATFORM_TENANT, actor.uid, `member.${body.status}`, 'member', targetUid);
          return json(200, { ok: true }, req);
        }
      }
    }

    // Step 2 of MFA login: exchange the challenge token + a valid TOTP code for a real token.
    if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'mfa' && seg[2] === 'login') {
      const body = await readJson(req);
      let claims;
      try {
        claims = await verifyJwt(String(body.challengeToken ?? ''));
      } catch {
        return json(401, { error: 'Invalid or expired MFA challenge.' }, req);
      }
      if (claims.mfa !== true) return json(401, { error: 'Invalid MFA challenge.' }, req);
      const { data: member } = await db
        .from('members')
        .select('*')
        .eq('tenant_id', String(claims.tenantId ?? ''))
        .eq('uid', String(claims.sub ?? ''))
        .maybeSingle();
      const mfa = member?.mfa ?? {};
      if (!member || member.status !== 'active' || mfa.enabled !== true || typeof mfa.secret !== 'string' || !(await verifyMfaCode(mfa.secret, body.code))) {
        return json(401, { error: 'Invalid authentication code.' }, req);
      }
      const { token, exp } = await signJwt({ sub: member.uid, tenantId: member.tenant_id, role: member.role, platform: false });
      return json(200, {
        token,
        expiresAt: new Date(exp * 1000).toISOString(),
        user: { uid: member.uid, tenantId: member.tenant_id, role: member.role, displayName: member.display_name, email: member.email },
      }, req);
    }

    // Any signed-in user can change their own password (needs the current one).
    if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'change-password') {
      const actor = await getActor(req);
      const body = await readJson(req);
      const current = String(body.currentPassword ?? '');
      const next = String(body.newPassword ?? '');
      if (next.length < 8) return json(400, { error: 'New password must be at least 8 characters.' });
      const { data: member } = await db
        .from('members')
        .select('*')
        .eq('tenant_id', actor.tenantId)
        .eq('uid', actor.uid)
        .maybeSingle();
      if (!member || typeof member.password_hash !== 'string' || !(await verifyPassword(current, member.password_hash))) {
        return json(401, { error: 'Current password is incorrect.' });
      }
      await db.from('members').update({ password_hash: await hashPassword(next) }).eq('tenant_id', actor.tenantId).eq('uid', actor.uid);
      return json(200, { ok: true });
    }

    // --- TOTP MFA self-service (signed-in member, own account) ---------------
    if (seg[0] === 'tenants' && seg[2] === 'mfa') {
      const tenantId = seg[1];
      const actor = await getActor(req);
      requireTenant(actor, tenantId);
      const { data: member } = await db.from('members').select('*').eq('tenant_id', tenantId).eq('uid', actor.uid).maybeSingle();
      if (!member) return json(404, { error: 'User not found.' }, req);
      const mfa = member.mfa ?? {};

      if (method === 'GET' && !seg[3]) {
        return json(200, { enabled: mfa.enabled === true }, req);
      }
      // Begin enrolment: generate a secret + otpauth URI; stays enabled:false until verified.
      if (method === 'POST' && seg[3] === 'enroll') {
        const account = member.email ?? actor.uid;
        const secret = generateMfaSecret();
        await db.from('members').update({ mfa: { enabled: false, secret } }).eq('tenant_id', tenantId).eq('uid', actor.uid);
        return json(200, { secret, otpauthUri: mfaOtpAuthUri(secret, account), account, issuer: 'ISO Audit' }, req);
      }
      // Verify-and-activate.
      if (method === 'POST' && seg[3] === 'activate') {
        const body = await readJson(req);
        if (typeof mfa.secret !== 'string') return json(400, { error: 'Start MFA enrolment first.' }, req);
        if (!(await verifyMfaCode(mfa.secret, body.code))) return json(400, { error: 'That code did not match. Check your device time and try again.' }, req);
        await db.from('members').update({ mfa: { enabled: true, secret: mfa.secret, enrolledAt: new Date().toISOString() } }).eq('tenant_id', tenantId).eq('uid', actor.uid);
        return json(200, { enabled: true }, req);
      }
      // Disable (requires a current valid code).
      if (method === 'POST' && seg[3] === 'disable') {
        const body = await readJson(req);
        if (mfa.enabled !== true || typeof mfa.secret !== 'string') return json(200, { enabled: false }, req);
        if (!(await verifyMfaCode(mfa.secret, body.code))) return json(400, { error: 'That code did not match.' }, req);
        await db.from('members').update({ mfa: { enabled: false } }).eq('tenant_id', tenantId).eq('uid', actor.uid);
        return json(200, { enabled: false }, req);
      }
    }

    // --- Tenant SSO (OIDC) ---------------------------------------------------
    // Public, secret-free config for the login screen.
    if (method === 'GET' && seg[0] === 'tenants' && seg[2] === 'sso' && seg[3] === 'public') {
      const { data } = await db.from('sso_configs').select('doc').eq('tenant_id', seg[1]).maybeSingle();
      const doc = data?.doc;
      if (!doc || doc.enabled !== true) return json(200, { enabled: false }, req);
      return json(200, { enabled: true, displayName: doc.displayName ?? 'SSO' }, req);
    }
    // Admin CRUD for SSO config (tenantAdmin). No client secret is stored.
    if (seg[0] === 'tenants' && seg[2] === 'sso' && !seg[3]) {
      const tenantId = seg[1];
      const actor = await getActor(req);
      requireTenant(actor, tenantId);
      requireRole(actor, ['tenantAdmin']);
      if (method === 'GET') {
        const { data } = await db.from('sso_configs').select('doc').eq('tenant_id', tenantId).maybeSingle();
        return json(200, { sso: data?.doc ?? null }, req);
      }
      if (method === 'PUT') {
        const body = await readJson(req);
        if (!/^https?:\/\//.test(String(body.issuer ?? ''))) return json(400, { error: 'Issuer must be a full https URL.' }, req);
        if (!String(body.clientId ?? '')) return json(400, { error: 'Client id is required.' }, req);
        const doc = {
          enabled: body.enabled === true,
          provider: 'oidc',
          displayName: String(body.displayName ?? 'SSO').slice(0, 120),
          issuer: String(body.issuer),
          clientId: String(body.clientId).slice(0, 400),
          authorizationEndpoint: body.authorizationEndpoint ? String(body.authorizationEndpoint) : undefined,
          tokenEndpoint: body.tokenEndpoint ? String(body.tokenEndpoint) : undefined,
          scopes: String(body.scopes ?? 'openid email profile').slice(0, 200),
          updatedAt: new Date().toISOString(),
        };
        await db.from('sso_configs').upsert({ tenant_id: tenantId, doc, updated_at: doc.updatedAt }, { onConflict: 'tenant_id' });
        return json(200, { sso: doc }, req);
      }
    }
    // Initiate OIDC sign-in (public): build the spec-correct redirect + state.
    if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'sso' && seg[2] === 'initiate') {
      const body = await readJson(req);
      const tenantId = String(body.tenantId ?? '');
      const { data } = await db.from('sso_configs').select('doc').eq('tenant_id', tenantId).maybeSingle();
      const doc = data?.doc;
      if (!doc || doc.enabled !== true) return json(404, { error: 'SSO is not configured for this tenant.' }, req);
      const state = `${tenantId}.${crypto.randomUUID()}`;
      const nonce = crypto.randomUUID();
      const redirectUri = `${String(SSO_CALLBACK_BASE_URL).replace(/\/$/, '')}/auth/sso/callback`;
      return json(200, { authorizationUrl: buildAuthorizationUrl(doc, redirectUri, state, nonce), state }, req);
    }
    // OIDC callback. SCAFFOLDED: the live IdP token exchange is gated by
    // SSO_LIVE_EXCHANGE. We never mint a session without a verified IdP assertion.
    if (method === 'GET' && seg[0] === 'auth' && seg[1] === 'sso' && seg[2] === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || !state) return json(400, { error: 'Missing code or state.' }, req);
      if (!SSO_LIVE_EXCHANGE) {
        return json(501, { error: 'sso_exchange_not_enabled', detail: 'OIDC redirect/initiate is live; the IdP token exchange is gated. Set SSO_LIVE_EXCHANGE=true and provide the per-tenant client secret as a function secret to enable it.' }, req);
      }
      return json(501, { error: 'sso_exchange_not_implemented' }, req);
    }

    // --- SCIM provisioning token management (tenantAdmin) --------------------
    if (seg[0] === 'tenants' && seg[2] === 'scim-token') {
      const tenantId = seg[1];
      const actor = await getActor(req);
      requireTenant(actor, tenantId);
      requireRole(actor, ['tenantAdmin']);
      if (method === 'GET') {
        const { data } = await db.from('provisioning_tokens').select('id').eq('tenant_id', tenantId).is('revoked_at', null).limit(1);
        return json(200, { configured: (data ?? []).length > 0 }, req);
      }
      if (method === 'POST') {
        const now = new Date().toISOString();
        await db.from('provisioning_tokens').update({ revoked_at: now }).eq('tenant_id', tenantId).is('revoked_at', null);
        const token = `scim_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
        await db.from('provisioning_tokens').insert({ id: `pvt-${crypto.randomUUID()}`, tenant_id: tenantId, token_hash: await sha256Hex(token), created_at: now, created_by_uid: actor.uid, revoked_at: null, last_used_at: null });
        return json(201, { token, createdAt: now }, req);
      }
      if (method === 'PUT') {
        await db.from('provisioning_tokens').update({ revoked_at: new Date().toISOString() }).eq('tenant_id', tenantId).is('revoked_at', null);
        return json(200, { configured: false }, req);
      }
    }

    // --- SCIM v2 Users (provisioning-token authenticated) -------------------
    if (seg[0] === 'scim' && seg[1] === 'v2' && seg[2] === 'Users') {
      const authz = req.headers.get('authorization') ?? '';
      const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
      const errSchemas = ['urn:ietf:params:scim:api:messages:2.0:Error'];
      if (!bearer) return json(401, { schemas: errSchemas, status: '401', detail: 'Missing provisioning token.' }, req);
      const { data: grant } = await db.from('provisioning_tokens').select('tenant_id').eq('token_hash', await sha256Hex(bearer)).is('revoked_at', null).maybeSingle();
      if (!grant) return json(401, { schemas: errSchemas, status: '401', detail: 'Invalid provisioning token.' }, req);
      const tenantId = grant.tenant_id;
      await db.from('provisioning_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', await sha256Hex(bearer));

      if (method === 'POST' && !seg[3]) {
        const body = await readJson(req);
        const externalId = String(body.externalId ?? '');
        const emailRaw = (Array.isArray(body.emails) ? (body.emails.find((e) => e.primary) ?? body.emails[0])?.value : null) ?? body.userName ?? '';
        const email = String(emailRaw).toLowerCase().trim();
        if (!externalId || !EMAIL_RE.test(email)) return json(400, { schemas: errSchemas, status: '400', detail: 'externalId and a valid email are required.' }, req);
        const role = TENANT_ROLES.includes(body.role) ? body.role : 'auditor';
        const active = body.active !== false;
        const fromName = body.name?.formatted ?? [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ').trim();
        const displayName = String(body.displayName ?? (fromName || '') ?? '').trim() || email.split('@')[0];
        const { data: existing } = await db.from('members').select('*').ilike('email', email).maybeSingle();
        if (existing) {
          if (existing.tenant_id !== tenantId) return json(409, { schemas: errSchemas, status: '409', detail: 'That email belongs to another tenant.' }, req);
          await db.from('members').update({ status: active ? 'active' : 'disabled', external_id: externalId }).eq('uid', existing.uid);
          return json(200, { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: existing.uid, externalId, userName: email, displayName: existing.display_name ?? displayName, active, emails: [{ value: email, primary: true }] }, req);
        }
        const uid = `uid-${crypto.randomUUID()}`;
        const { error } = await db.from('members').insert({ tenant_id: tenantId, uid, email, role, display_name: displayName, status: active ? 'active' : 'disabled', external_id: externalId, provisioned_via: 'scim' });
        if (error) return json(500, { schemas: errSchemas, status: '500', detail: 'Could not provision the user.' }, req);
        return json(201, { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: uid, externalId, userName: email, displayName, active, emails: [{ value: email, primary: true }] }, req);
      }

      if (method === 'DELETE' && seg[3]) {
        const externalId = seg[3];
        const { data: target } = await db.from('members').select('uid').eq('tenant_id', tenantId).eq('external_id', externalId).maybeSingle();
        if (!target) return json(404, { schemas: errSchemas, status: '404', detail: 'User not found.' }, req);
        await db.from('members').update({ status: 'disabled' }).eq('tenant_id', tenantId).eq('external_id', externalId);
        return new Response(null, { status: 204, headers: corsHeaders(req) });
      }
    }

    // Member management — tenantAdmin or leadAuditor. Guardrails below prevent
    // privilege escalation (only an admin grants admin) and self-lockout.
    if (seg[0] === 'tenants' && seg[2] === 'members') {
      const tenantId = seg[1];
      const actor = await getActor(req);
      requireTenant(actor, tenantId);
      requireRole(actor, ['tenantAdmin', 'leadAuditor']);
      const targetUid = seg[3];

      if (method === 'GET' && !targetUid) {
        const { data } = await db
          .from('members')
          .select('uid,email,role,display_name,status,created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true });
        return json(200, { members: (data ?? []).map(toMember) });
      }

      if (method === 'POST' && !targetUid) {
        const body = await readJson(req);
        const email = String(body.email ?? '').toLowerCase().trim();
        const displayName = String(body.displayName ?? '').trim();
        const role = String(body.role ?? 'auditor');
        if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' });
        if (!TENANT_ROLES.includes(role)) return json(400, { error: 'Unknown role.' });
        if (role === 'tenantAdmin' && actor.role !== 'tenantAdmin') {
          return json(403, { error: 'Only a tenant admin can create another tenant admin.' });
        }
        const { data: existing } = await db.from('members').select('uid').ilike('email', email).maybeSingle();
        if (existing) return json(409, { error: 'A user with that email already exists.' });
        // Invite flow: create 'invited' (no password) and email a set-password link.
        const { member, link } = await createInvitedMember({ tenantId, tenantName: await tenantNameFor(tenantId), role, email, displayName });
        return json(201, { member, setPasswordLink: EXPOSE_SET_PASSWORD_LINK ? link : undefined });
      }

      if (targetUid) {
        const { data: target } = await db
          .from('members')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('uid', targetUid)
          .maybeSingle();
        if (!target) return json(404, { error: 'User not found.' });

        if (method === 'POST' && seg[4] === 'password') {
          // Issue a single-use set-password link instead of a raw temp password.
          const { link } = await issueSetPasswordToken(targetUid, tenantId, target.email, 'reset');
          await sendInviteEmail(target.email, link, await tenantNameFor(tenantId), 'reset');
          return json(200, { ok: true, setPasswordLink: EXPOSE_SET_PASSWORD_LINK ? link : undefined });
        }

        if (method === 'PUT') {
          const body = await readJson(req);
          const patch = {};
          if (typeof body.displayName === 'string') patch.display_name = body.displayName.trim();
          if (typeof body.role === 'string') {
            if (!TENANT_ROLES.includes(body.role)) return json(400, { error: 'Unknown role.' });
            if (body.role === 'tenantAdmin' && actor.role !== 'tenantAdmin') {
              return json(403, { error: 'Only a tenant admin can grant tenant admin.' });
            }
            if (targetUid === actor.uid && body.role !== actor.role) {
              return json(403, { error: 'You cannot change your own role.' });
            }
            patch.role = body.role;
          }
          if (typeof body.status === 'string') {
            if (!['active', 'disabled'].includes(body.status)) return json(400, { error: 'Unknown status.' });
            if (targetUid === actor.uid && body.status !== 'active') {
              return json(403, { error: 'You cannot deactivate your own account.' });
            }
            patch.status = body.status;
          }
          if (Object.keys(patch).length === 0) return json(400, { error: 'Nothing to update.' });
          await db.from('members').update(patch).eq('tenant_id', tenantId).eq('uid', targetUid);
          return json(200, { member: toMember({ ...target, ...patch }) });
        }
      }
    }

    if (seg[0] === 'tenants' && seg[2] === 'programme') {
      const tenantId = seg[1];
      const actor = await getActor(req);
      requireTenant(actor, tenantId);
      if (method === 'GET') {
        const { data } = await db.from('programmes').select('doc').eq('tenant_id', tenantId).maybeSingle();
        return json(200, data?.doc ?? null);
      }
      if (method === 'PUT') {
        requireRole(actor, ['tenantAdmin', 'leadAuditor']);
        const body = await readJson(req);
        const doc = { ...body, tenantId, updatedAt: new Date().toISOString() };
        await db.from('programmes').upsert({ tenant_id: tenantId, doc, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
        return json(200, { programme: doc });
      }
    }

    // Audit collection: list + create.
    if (seg[0] === 'tenants' && seg[2] === 'audits' && seg.length === 3) {
      const tenantId = seg[1];
      const actor = await getActor(req);
      requireTenant(actor, tenantId);
      if (method === 'GET') {
        const { data } = await db
          .from('audits')
          .select('doc')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
        return json(200, { audits: (data ?? []).map((r) => r.doc) });
      }
      if (method === 'POST') {
        requireRole(actor, ['tenantAdmin', 'leadAuditor']);
        const body = await readJson(req);
        const now = new Date().toISOString();
        const id = `audit-${crypto.randomUUID()}`;
        const doc = {
          id,
          auditee: String(body.auditee ?? '').slice(0, 300),
          scope: String(body.scope ?? '').slice(0, 2000),
          criteria: body.criteria === 'ISO 45001:2026' ? 'ISO 45001:2026' : 'ISO 45001:2018',
          status: 'planned',
          startsAt: body.startsAt ?? null,
          endsAt: body.endsAt ?? null,
          createdByName: body.createdByName ?? actor.uid,
          createdAt: now,
        };
        await db.from('audits').insert({ tenant_id: tenantId, audit_id: id, doc });
        for (const item of starterChecklist()) {
          await upsertRecord(tenantId, id, 'checklist', item.id, item);
        }
        await upsertRecord(tenantId, id, 'status', 'status', { status: 'planned' });
        return json(201, { audit: doc });
      }
    }

    if (seg[0] === 'tenants' && seg[2] === 'audits') {
      const tenantId = seg[1];
      const auditId = seg[3];
      const rest = seg.slice(4);
      const actor = await getActor(req);
      requireTenant(actor, tenantId);

      if (method === 'GET' && rest[0] === 'field-state') {
        const rows = await listRecords(tenantId, auditId);
        const byKind = (k) => rows.filter((r) => r.kind === k).map((r) => r.doc);
        const single = (k) => rows.find((r) => r.kind === k)?.doc ?? null;
        const statusDoc = single('status');
        const { data: auditRow } = await db
          .from('audits')
          .select('doc')
          .eq('tenant_id', tenantId)
          .eq('audit_id', auditId)
          .maybeSingle();
        return json(200, {
          audit: auditRow?.doc ?? null,
          items: byKind('checklist'),
          evidence: byKind('evidence'),
          evidenceRequests: byKind('evidenceRequest'),
          findings: byKind('finding'),
          capas: byKind('capa'),
          aspects: byKind('aspect'),
          obligations: byKind('obligation'),
          emergencyRecords: byKind('emergency'),
          interestedParties: byKind('interestedParty'),
          objectives: byKind('objective'),
          communications: byKind('communication'),
          managementReviews: byKind('managementReview'),
          risksOpportunities: byKind('riskOpportunity'),
          resources: byKind('resource'),
          competence: byKind('competence'),
          workers: byKind('worker'),
          sites: byKind('site'),
          awareness: byKind('awareness'),
          documentedInfo: byKind('documentedInfo'),
          performanceMetrics: byKind('performanceMetric'),
          permits: byKind('permit'),
          incidents: byKind('incident'),
          hira: byKind('hira'),
          calibration: byKind('calibration'),
          training: byKind('training'),
          suppliers: byKind('supplier'),
          changes: byKind('change-moc'),
          operationalControls: byKind('operationalControl'),
          leadership: byKind('leadership'),
          context: byKind('context'),
          interviews: byKind('interview'),
          envAspects: byKind('envAspect'),
          envObligations: byKind('envObligation'),
          envObjectives: byKind('envObjective'),
          workerConsultations: byKind('consultation'),
          meetings: byKind('meeting'),
          conclusion: single('conclusion'),
          reportMeta: single('reportMeta'),
          changeLog: byKind('change').sort((a, b) => String(b.at).localeCompare(String(a.at))),
          auditStatus: statusDoc?.status ?? auditRow?.doc?.status ?? 'fieldwork',
        }, req);
      }

      if (method === 'PUT' && rest[0] === 'checklist' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const existing = (await getRecord(tenantId, auditId, 'checklist', rest[1])) ?? { id: rest[1] };
        const merged = { ...existing, result: body.result, note: body.note ?? null, updatedAt: new Date().toISOString() };
        await upsertRecord(tenantId, auditId, 'checklist', rest[1], merged);
        return json(200, { ok: true });
      }

      if (method === 'POST' && rest[0] === 'evidence' && !rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const id = String(body.id);
        await upsertRecord(tenantId, auditId, 'evidence', id, { ...body, createdBy: actor.uid });
        const itemId = body.itemId ? String(body.itemId) : '';
        if (itemId) {
          const item = await getRecord(tenantId, auditId, 'checklist', itemId);
          if (item) {
            const ids = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
            if (!ids.includes(id)) ids.push(id);
            await upsertRecord(tenantId, auditId, 'checklist', itemId, { ...item, evidenceIds: ids });
          }
        }
        return json(201, { evidence: body });
      }

      // Photo upload proxied through the function: the browser downscales the
      // image and POSTs the bytes here; we write them to the private bucket
      // with the service role. Path is tenant/audit-scoped.
      if (method === 'POST' && rest[0] === 'evidence' && rest[1] && rest[2] === 'photo') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const contentType = req.headers.get('content-type') || 'image/jpeg';
        if (!contentType.startsWith('image/')) return json(400, { error: 'Expected an image upload.' });
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (bytes.length === 0) return json(400, { error: 'Empty upload.' });
        if (bytes.length > 6_000_000) return json(413, { error: 'Photo too large (max ~6 MB after downscaling).' });
        const storagePath = `${tenantId}/${auditId}/${rest[1]}`;
        const { error } = await db.storage.from('evidence').upload(storagePath, bytes, { contentType, upsert: true });
        if (error) return json(500, { error: 'Photo upload failed.' });
        return json(200, { ok: true, path: storagePath });
      }

      // Short-lived signed read URL for an uploaded photo (private bucket).
      if (method === 'GET' && rest[0] === 'evidence' && rest[1] && rest[2] === 'view-url') {
        const storagePath = `${tenantId}/${auditId}/${rest[1]}`;
        const { data, error } = await db.storage.from('evidence').createSignedUrl(storagePath, 3600);
        if (error || !data) return json(404, { error: 'No uploaded photo for this evidence.' });
        return json(200, { url: data.signedUrl });
      }

      // AI photo-evidence analysis (server-side vision). Inert until
      // ANTHROPIC_API_KEY + a vision model (ANTHROPIC_VISION_MODEL or
      // ANTHROPIC_MODEL) are set as function secrets → 501 ai_not_configured, so
      // the client shows the graceful "needs the server/key" state. Returns a
      // candidate (observations / hazard tags / suggested clause + finding) with
      // status needsAuditorReview; the auditor accepts/rejects — nothing is
      // auto-applied. The prompt forbids verbatim ISO requirement text (copyright).
      if (method === 'POST' && rest[0] === 'evidence' && rest[1] && rest[2] === 'analyze') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const model = Deno.env.get('ANTHROPIC_VISION_MODEL') ?? Deno.env.get('ANTHROPIC_MODEL');
        if (!apiKey || !model) return json(501, { error: 'ai_not_configured' }, req);
        // Prefer image bytes in the body; otherwise download the stored photo.
        let imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined;
        let mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
        if (!imageBase64) {
          const storagePath = `${tenantId}/${auditId}/${rest[1]}`;
          const { data, error } = await db.storage.from('evidence').download(storagePath);
          if (!error && data) {
            const bytes = new Uint8Array(await data.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
            imageBase64 = btoa(binary);
            mimeType = data.type || mimeType;
          }
        }
        if (!imageBase64) return json(422, { error: 'no_image' }, req);
        const system =
          'You are an ISO 45001 occupational health & safety auditor assistant reviewing a single site photo. Suggest only what is visible. Use ISO 45001 clause numbers and short titles only; do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only with keys: observations (string[]), hazardTags (string[]), suggestedClauseId (string), suggestedFindingStatement (string), suggestedType (one of minorNc, majorNc, ofi, conformity). Every suggestion is a candidate for an auditor to review; do not assert conclusions.';
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              system,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                    { type: 'text', text: 'Analyze this OH&S site photo and return the JSON object.' },
                  ],
                },
              ],
            }),
          });
          if (!aiRes.ok) return json(502, { error: 'ai_upstream' }, req);
          const payload = await aiRes.json();
          const text = (payload?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
          const found = text.match(/\{[\s\S]*\}/);
          if (!found) return json(502, { error: 'ai_parse' }, req);
          const parsed = JSON.parse(found[0]);
          const types = ['minorNc', 'majorNc', 'ofi', 'conformity'];
          const stringList = (value: unknown) =>
            Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
          return json(
            200,
            {
              status: 'needsAuditorReview',
              observations: stringList(parsed.observations),
              hazardTags: stringList(parsed.hazardTags),
              suggestedClauseId: typeof parsed.suggestedClauseId === 'string' ? parsed.suggestedClauseId : undefined,
              suggestedFindingStatement:
                typeof parsed.suggestedFindingStatement === 'string' ? parsed.suggestedFindingStatement : undefined,
              suggestedType: types.includes(parsed.suggestedType) ? parsed.suggestedType : 'ofi',
              provider: 'anthropicClaude',
              generatedAt: new Date().toISOString(),
            },
            req,
          );
        } catch {
          return json(502, { error: 'ai_failed' }, req);
        }
      }

      if (method === 'PUT' && rest[0] === 'findings' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const finding = cleanFinding(body, requireId(rest[1]));
        await upsertRecord(tenantId, auditId, 'finding', finding.id, finding);
        return json(200, { finding });
      }

      // Client portal evidence request. Auditors author it; an auditee
      // (clientViewer) may only append submissions/messages (merge boundary).
      if (method === 'PUT' && rest[0] === 'evidence-requests' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor', 'clientViewer']);
        const body = await readJson(req);
        const id = requireId(rest[1]);
        if (actor.role === 'clientViewer') {
          const existing = await getRecord(tenantId, auditId, 'evidenceRequest', id);
          if (!existing) throw new AuthError('Auditees cannot create evidence requests.');
          const merged = mergeAuditeeEvidenceRequest(existing, body);
          await upsertRecord(tenantId, auditId, 'evidenceRequest', id, merged);
          await logChange(tenantId, auditId, actor.uid, 'auditee-update', 'evidenceRequest', id);
          return json(200, { evidenceRequest: merged }, req);
        }
        const record = cleanEvidenceRequest(body, id);
        await upsertRecord(tenantId, auditId, 'evidenceRequest', id, record);
        await logChange(tenantId, auditId, actor.uid, 'upsert', 'evidenceRequest', id);
        return json(200, { evidenceRequest: record }, req);
      }

      if (method === 'POST' && rest[0] === 'capa' && rest[1] && rest[2] === 'verify') {
        requireRole(actor, ['leadAuditor']);
        const body = await readJson(req);
        const capa = await getRecord(tenantId, auditId, 'capa', rest[1]);
        const now = new Date().toISOString();
        const effective = body.effective === true;
        if (capa) {
          await upsertRecord(tenantId, auditId, 'capa', rest[1], {
            ...capa,
            status: effective ? 'verified' : 'inProgress',
            verification: body.verification ?? '',
            verificationEvidenceIds: body.verificationEvidenceIds ?? [],
            verifiedByName: actor.uid,
            verifiedAt: now,
          });
        }
        const findingId = String(body.findingId ?? '');
        if (findingId) {
          const finding = await getRecord(tenantId, auditId, 'finding', findingId);
          if (finding) {
            await upsertRecord(tenantId, auditId, 'finding', findingId, { ...finding, status: effective ? 'closed' : 'reopened' });
          }
        }
        await logChange(tenantId, auditId, actor.uid, effective ? 'verify-effective' : 'verify-ineffective', 'capa', rest[1]);
        return json(200, { ok: true }, req);
      }

      if (method === 'PUT' && rest[0] === 'capa' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const capa = cleanCapa(body, requireId(rest[1]));
        await upsertRecord(tenantId, auditId, 'capa', capa.id, capa);
        return json(200, { capa });
      }

      if (method === 'PUT' && rest[0] === 'status') {
        requireRole(actor, ['leadAuditor']);
        const body = await readJson(req);
        await upsertRecord(tenantId, auditId, 'status', 'status', { status: body.status });
        const { data: auditRow } = await db.from('audits').select('doc').eq('tenant_id', tenantId).eq('audit_id', auditId).maybeSingle();
        if (auditRow?.doc) {
          await db.from('audits').update({ doc: { ...auditRow.doc, status: body.status }, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('audit_id', auditId);
        }
        await logChange(tenantId, auditId, actor.uid, 'set-status', 'audit', String(body.status ?? ''));
        return json(200, { ok: true }, req);
      }

      if (method === 'PUT' && rest[0] === 'meetings' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        await upsertRecord(tenantId, auditId, 'meeting', rest[1], body);
        return json(200, { meeting: body });
      }

      if (method === 'PUT' && rest[0] === 'conclusion') {
        requireRole(actor, ['leadAuditor']);
        const body = await readJson(req);
        const doc = { ...body, updatedAt: new Date().toISOString() };
        await upsertRecord(tenantId, auditId, 'conclusion', 'conclusion', doc);
        return json(200, { conclusion: doc });
      }

      // Report front-matter (singleton). Validated like a register so it can't
      // persist oversized/unknown-typed fields; reportVersion kept numeric.
      if (method === 'PUT' && rest[0] === 'report-meta') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const doc = cleanRegister(body, 'report-meta');
        doc.auditType = ['internal', 'stage1', 'stage2', 'surveillance', 'recertification'].includes(body.auditType)
          ? body.auditType
          : 'stage2';
        doc.impartialityDeclared = body.impartialityDeclared === true;
        doc.reportVersion = Number.isFinite(body.reportVersion) && body.reportVersion > 0 ? Math.floor(body.reportVersion) : 1;
        await upsertRecord(tenantId, auditId, 'reportMeta', 'reportMeta', doc);
        return json(200, { reportMeta: doc }, req);
      }

      // AI report draft (server-side). Inert until ANTHROPIC_API_KEY + ANTHROPIC_MODEL
      // are set as function secrets; the client falls back to its offline rule-based
      // composer on any non-2xx, so the feature still works without a key. The prompt
      // forbids verbatim ISO requirement text (copyright guardrail).
      if (method === 'POST' && rest[0] === 'report-draft') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const input = await readJson(req);
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const model = Deno.env.get('ANTHROPIC_MODEL');
        if (!apiKey || !model) return json(501, { error: 'ai_not_configured' }, req);
        const system =
          'You are an ISO 45001 lead auditor assistant drafting an audit report. Use ONLY the audit data provided and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only, with keys overallConformity, emsEffectivenessOpinion, criteriaMetStatement, recommendation. recommendation must be one of recommend, conditional, notRecommended, satisfactory, actionRequired.';
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model,
              max_tokens: 1200,
              system,
              messages: [{ role: 'user', content: `Audit data:\n${JSON.stringify(input)}` }],
            }),
          });
          if (!aiRes.ok) return json(502, { error: 'ai_upstream' }, req);
          const payload = await aiRes.json();
          const text = (payload?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
          const found = text.match(/\{[\s\S]*\}/);
          if (!found) return json(502, { error: 'ai_parse' }, req);
          const parsed = JSON.parse(found[0]);
          const recs = ['recommend', 'conditional', 'notRecommended', 'satisfactory', 'actionRequired'];
          return json(
            200,
            {
              overallConformity: String(parsed.overallConformity ?? ''),
              emsEffectivenessOpinion: String(parsed.emsEffectivenessOpinion ?? ''),
              criteriaMetStatement: String(parsed.criteriaMetStatement ?? ''),
              recommendation: recs.includes(parsed.recommendation) ? parsed.recommendation : 'satisfactory',
              source: 'ai',
              generatedAt: new Date().toISOString(),
            },
            req,
          );
        } catch {
          return json(502, { error: 'ai_failed' }, req);
        }
      }

      // AI audit agenda + opening/closing meeting scripts (server-side). Inert until
      // ANTHROPIC_API_KEY + ANTHROPIC_MODEL are set as function secrets; the client
      // falls back to its offline rule-based composer on any non-2xx, so the feature
      // still works without a key. The prompt forbids verbatim ISO requirement text
      // (copyright guardrail).
      if (method === 'POST' && rest[0] === 'agenda-draft') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const input = await readJson(req);
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const model = Deno.env.get('ANTHROPIC_MODEL');
        if (!apiKey || !model) return json(501, { error: 'ai_not_configured' }, req);
        const system =
          'You are an ISO 45001 lead auditor assistant drafting (a) a tailored audit agenda and (b) opening- and closing-meeting talking-point scripts. Use ONLY the audit data provided and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only, with two keys: "agenda" and "scripts". "agenda" has keys title, scope, criteria, objectives (string array), itinerary (array of {clause, title, duration, focus}) and samplingNotes (string array). "scripts" has keys opening and closing, each an object with heading and talkingPoints (string array). The opening script covers introductions, confidentiality, safety induction/PPE/permits, scope+criteria+methods, the sampling caveat, how findings are graded and communicated, and closing-meeting arrangements. The closing script covers a findings summary by grade, agreed correction timelines (major ~30 days, minor ~90 days), auditee acknowledgement, and the recommendation plus next steps.';
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model,
              max_tokens: 2000,
              system,
              messages: [{ role: 'user', content: `Audit data:\n${JSON.stringify(input)}` }],
            }),
          });
          if (!aiRes.ok) return json(502, { error: 'ai_upstream' }, req);
          const payload = await aiRes.json();
          const text = (payload?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
          const found = text.match(/\{[\s\S]*\}/);
          if (!found) return json(502, { error: 'ai_parse' }, req);
          const parsed = JSON.parse(found[0]);
          const generatedAt = new Date().toISOString();
          const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')) : []);
          const agendaIn = parsed.agenda ?? {};
          const scriptsIn = parsed.scripts ?? {};
          const itinerary = Array.isArray(agendaIn.itinerary)
            ? agendaIn.itinerary.map((slot: Record<string, unknown>) => ({
                clause: String(slot?.clause ?? ''),
                title: String(slot?.title ?? ''),
                duration: String(slot?.duration ?? ''),
                focus: String(slot?.focus ?? ''),
              }))
            : [];
          const script = (s: Record<string, unknown> | undefined, heading: string) => ({
            heading: String(s?.heading ?? heading),
            talkingPoints: strArr(s?.talkingPoints),
          });
          return json(
            200,
            {
              agenda: {
                title: String(agendaIn.title ?? ''),
                scope: String(agendaIn.scope ?? ''),
                criteria: String(agendaIn.criteria ?? ''),
                objectives: strArr(agendaIn.objectives),
                itinerary,
                samplingNotes: strArr(agendaIn.samplingNotes),
                source: 'ai',
                generatedAt,
              },
              scripts: {
                opening: script(scriptsIn.opening, 'Opening meeting'),
                closing: script(scriptsIn.closing, 'Closing meeting'),
                source: 'ai',
                generatedAt,
              },
            },
            req,
          );
        } catch {
          return json(502, { error: 'ai_failed' }, req);
        }
      }

      // AI "ask the standard" copilot (server-side). Inert until ANTHROPIC_API_KEY +
      // ANTHROPIC_MODEL are set; the client falls back to its offline field-guide
      // answerer on any non-2xx. The prompt forbids verbatim ISO requirement text.
      if (method === 'POST' && rest[0] === 'copilot' && rest[1] === 'ask') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const question = typeof body?.question === 'string' ? body.question : '';
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const model = Deno.env.get('ANTHROPIC_MODEL');
        if (!apiKey || !model || !question) return json(501, { error: 'ai_not_configured' }, req);
        const system =
          "You are an ISO 45001 lead auditor assistant. Answer the auditor's question using ISO 45001 clause numbers and short titles plus general OH&S auditing good practice. Do NOT quote or paraphrase verbatim ISO requirement text. Respond with a strict JSON object only: { \"answer\": string, \"clauseRefs\": [{ \"clauseId\": string, \"title\": string }] }.";
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: 900, system, messages: [{ role: 'user', content: question }] }),
          });
          if (!aiRes.ok) return json(502, { error: 'ai_upstream' }, req);
          const payload = await aiRes.json();
          const text = (payload?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
          const found = text.match(/\{[\s\S]*\}/);
          if (!found) return json(502, { error: 'ai_parse' }, req);
          const parsed = JSON.parse(found[0]);
          const clauseRefs = Array.isArray(parsed.clauseRefs)
            ? parsed.clauseRefs
                .filter((r: { clauseId?: unknown }) => typeof r?.clauseId === 'string')
                .map((r: { clauseId: string; title?: unknown }) => ({ clauseId: String(r.clauseId), title: String(r.title ?? '') }))
            : [];
          return json(200, { answer: String(parsed.answer ?? ''), clauseRefs, source: 'ai' }, req);
        } catch {
          return json(502, { error: 'ai_failed' }, req);
        }
      }

      // AI finding draft (server-side). Inert until ANTHROPIC_API_KEY + ANTHROPIC_MODEL
      // are set as function secrets; the client falls back to its offline deterministic
      // composer on any non-2xx, so the feature still works without a key. The prompt
      // forbids verbatim ISO requirement text (copyright guardrail).
      if (method === 'POST' && rest[0] === 'finding-draft') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const input = await readJson(req);
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const model = Deno.env.get('ANTHROPIC_MODEL');
        if (!apiKey || !model) return json(501, { error: 'ai_not_configured' }, req);
        const system =
          'You are an ISO 45001 lead auditor assistant drafting a single audit finding (nonconformity). Use ONLY the finding data provided (clause id/title, note, result, evidence labels) and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text; never use the word "shall". Respond with a strict JSON object only, with keys draftStatement, requirementSummary, objectiveEvidence, suggestedType, gradingRationale, rootCausePrompts. suggestedType must be one of majorNc, minorNc, ofi. rootCausePrompts must be an array of short question strings.';
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model,
              max_tokens: 1200,
              system,
              messages: [{ role: 'user', content: `Finding data:\n${JSON.stringify(input)}` }],
            }),
          });
          if (!aiRes.ok) return json(502, { error: 'ai_upstream' }, req);
          const payload = await aiRes.json();
          const text = (payload?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
          const found = text.match(/\{[\s\S]*\}/);
          if (!found) return json(502, { error: 'ai_parse' }, req);
          const parsed = JSON.parse(found[0]);
          const types = ['majorNc', 'minorNc', 'ofi'];
          const prompts = Array.isArray(parsed.rootCausePrompts)
            ? parsed.rootCausePrompts.map((p: unknown) => String(p)).filter((p: string) => p.length > 0)
            : [];
          return json(
            200,
            {
              draftStatement: String(parsed.draftStatement ?? ''),
              requirementSummary: String(parsed.requirementSummary ?? ''),
              objectiveEvidence: String(parsed.objectiveEvidence ?? ''),
              suggestedType: types.includes(parsed.suggestedType) ? parsed.suggestedType : 'minorNc',
              gradingRationale: String(parsed.gradingRationale ?? ''),
              rootCausePrompts: prompts,
              source: 'ai',
              generatedAt: new Date().toISOString(),
            },
            req,
          );
        } catch {
          return json(502, { error: 'ai_failed' }, req);
        }
      }

      // AI client-context tailoring (server-side). Inert until ANTHROPIC_API_KEY +
      // ANTHROPIC_MODEL are set as function secrets; the client falls back to its
      // offline deterministic composer on any non-2xx, so the feature still works
      // without a key. The prompt forbids verbatim ISO requirement text and the
      // word "shall" (copyright guardrail).
      if (method === 'POST' && rest[0] === 'client-tailoring') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const input = await readJson(req);
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const model = Deno.env.get('ANTHROPIC_MODEL');
        if (!apiKey || !model) return json(501, { error: 'ai_not_configured' }, req);
        const system =
          'You are an ISO 45001 lead auditor assistant tailoring the audit checklist emphasis to a specific client. Use ONLY the client context provided (sector, headcount, sites, key hazards/processes, prior findings) and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text; never use the word "shall". Respond with a strict JSON object only, with keys summary, areas, riskNotes. "areas" is an array of { clauseId, clauseTitle, priority, rationale, focusPrompts } where priority is one of high, medium and focusPrompts is an array of short question strings. "riskNotes" is an array of short strings. Order areas with the highest-priority first.';
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model,
              max_tokens: 1600,
              system,
              messages: [{ role: 'user', content: `Client context:\n${JSON.stringify(input)}` }],
            }),
          });
          if (!aiRes.ok) return json(502, { error: 'ai_upstream' }, req);
          const payload = await aiRes.json();
          const text = (payload?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
          const found = text.match(/\{[\s\S]*\}/);
          if (!found) return json(502, { error: 'ai_parse' }, req);
          const parsed = JSON.parse(found[0]);
          const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')) : []);
          const areas = Array.isArray(parsed.areas)
            ? parsed.areas.map((area: Record<string, unknown>) => ({
                clauseId: String(area?.clauseId ?? ''),
                clauseTitle: String(area?.clauseTitle ?? ''),
                priority: area?.priority === 'high' ? 'high' : 'medium',
                rationale: String(area?.rationale ?? ''),
                focusPrompts: strArr(area?.focusPrompts),
              }))
            : [];
          return json(
            200,
            {
              summary: String(parsed.summary ?? ''),
              areas,
              riskNotes: strArr(parsed.riskNotes),
              source: 'ai',
              generatedAt: new Date().toISOString(),
            },
            req,
          );
        } catch {
          return json(502, { error: 'ai_failed' }, req);
        }
      }

      // AI corrective-action (CAPA) assistant (server-side). Inert until
      // ANTHROPIC_API_KEY + ANTHROPIC_MODEL are set as function secrets; the
      // client falls back to its offline deterministic composer on any non-2xx,
      // so the feature still works without a key. The prompt forbids verbatim ISO
      // requirement text and the word "shall" (copyright guardrail).
      if (method === 'POST' && rest[0] === 'corrective-action') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const input = await readJson(req);
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const model = Deno.env.get('ANTHROPIC_MODEL');
        if (!apiKey || !model) return json(501, { error: 'ai_not_configured' }, req);
        const system =
          'You are an ISO 45001 lead auditor assistant suggesting a root-cause analysis and a draft corrective-action plan for a single finding (nonconformity or opportunity for improvement). Use ONLY the finding data provided (clause id/title, type, title, description, systemic flag, related register context) and ISO 45001 clause numbers and short titles. Do NOT quote or paraphrase verbatim ISO requirement text; never use the word "shall". Frame root causes as hypotheses to test, not conclusions. Respond with a strict JSON object only, with keys rootCauseHypotheses, correctiveActions, containment, summary. "rootCauseHypotheses" is an array of short strings. "correctiveActions" is an array of { action, owner, why } where owner is a suggested role and why is a short rationale. "containment" is a short string (or omit it for an opportunity for improvement). "summary" is a one-line string.';
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model,
              max_tokens: 1600,
              system,
              messages: [{ role: 'user', content: `Finding data:\n${JSON.stringify(input)}` }],
            }),
          });
          if (!aiRes.ok) return json(502, { error: 'ai_upstream' }, req);
          const payload = await aiRes.json();
          const text = (payload?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
          const found = text.match(/\{[\s\S]*\}/);
          if (!found) return json(502, { error: 'ai_parse' }, req);
          const parsed = JSON.parse(found[0]);
          const strArr = (v: unknown): string[] =>
            Array.isArray(v) ? v.map((x) => String(x ?? '')).filter((x: string) => x.length > 0) : [];
          const correctiveActions = Array.isArray(parsed.correctiveActions)
            ? parsed.correctiveActions.map((step: Record<string, unknown>) => ({
                action: String(step?.action ?? ''),
                owner: step?.owner !== undefined ? String(step.owner) : undefined,
                why: String(step?.why ?? ''),
              }))
            : [];
          const containmentRaw = parsed.containment;
          return json(
            200,
            {
              rootCauseHypotheses: strArr(parsed.rootCauseHypotheses),
              correctiveActions,
              containment:
                typeof containmentRaw === 'string' && containmentRaw.length > 0 ? containmentRaw : undefined,
              summary: String(parsed.summary ?? ''),
              source: 'ai',
              generatedAt: new Date().toISOString(),
            },
            req,
          );
        } catch {
          return json(502, { error: 'ai_failed' }, req);
        }
      }

      if (method === 'POST' && rest[0] === 'reports' && rest[1] === 'signoff') {
        requireRole(actor, ['leadAuditor']);
        const body = await readJson(req);
        const now = new Date().toISOString();
        // Only accept a well-formed SHA-256 hex digest as the integrity fingerprint.
        const contentHash = typeof body.contentHash === 'string' && /^[0-9a-f]{64}$/.test(body.contentHash) ? body.contentHash : null;
        const report = { id: `report-${auditId}`, status: 'signed', signedBy: actor.uid, signedAt: now, attestation: body.attestation, contentHash, hashAlgorithm: contentHash ? 'SHA-256' : null };
        await upsertRecord(tenantId, auditId, 'report', report.id, report);
        await logChange(tenantId, auditId, actor.uid, 'sign-off', 'report', report.id);
        return json(200, { signedAt: now, report }, req);
      }

      const registerKinds = {
        aspects: 'aspect',
        obligations: 'obligation',
        emergency: 'emergency',
        'interested-parties': 'interestedParty',
        objectives: 'objective',
        communications: 'communication',
        'management-reviews': 'managementReview',
        'risks-opportunities': 'riskOpportunity',
        resources: 'resource',
        competence: 'competence',
        people: 'worker',
        sites: 'site',
        awareness: 'awareness',
        'documented-info': 'documentedInfo',
        'performance-metrics': 'performanceMetric',
        permits: 'permit',
        incidents: 'incident',
        hira: 'hira',
        calibration: 'calibration',
        training: 'training',
        suppliers: 'supplier',
        changes: 'change-moc',
        'operational-controls': 'operationalControl',
        leadership: 'leadership',
        context: 'context',
        interviews: 'interview',
        'environmental-aspects': 'envAspect',
        'environmental-obligations': 'envObligation',
        'environmental-objectives': 'envObjective',
        'worker-consultations': 'consultation',
      };
      if (method === 'PUT' && registerKinds[rest[0]] && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const record = cleanRegister(body, requireId(rest[1]));
        await upsertRecord(tenantId, auditId, registerKinds[rest[0]], record.id, record);
        return json(200, { record }, req);
      }
    }

    return json(404, { error: 'Route not found.' }, req);
  } catch (error) {
    if (error instanceof ValidationError) return json(400, { error: error.message }, req);
    if (error instanceof AuthError) return json(401, { error: error.message }, req);
    console.error('api error', error);
    return json(500, { error: 'Unexpected backend error.' }, req);
  }
});
