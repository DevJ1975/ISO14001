// Supabase Edge Function: ISO 14001 audit API.
// Mirrors the original Node/Mongo `/api` contract over Postgres JSONB tables.
// Custom auth (HS256 app JWT + PBKDF2 passwords via Web Crypto); deployed with
// verify_jwt=false so the app's own bearer token passes through unmodified.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  cleanCapa,
  cleanFinding,
  cleanRegister,
  isAuthConfigured,
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

// A fresh audit starts with the three top-level ISO 14001 clause checklist rows.
function starterChecklist() {
  const now = new Date().toISOString();
  return [
    { id: 'item-4', clauseId: '4', clauseTitle: 'Context of the organization', question: 'Verify internal/external EMS context and interested parties.', ownerName: '', result: 'notStarted', evidenceIds: [], updatedAt: now },
    { id: 'item-6', clauseId: '6', clauseTitle: 'Planning', question: 'Sample environmental aspects, compliance obligations, risks and objectives.', ownerName: '', result: 'notStarted', evidenceIds: [], updatedAt: now },
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
      const { token, exp } = await signJwt({ sub: member.uid, tenantId: member.tenant_id, role: member.role, platform: false });
      return json(200, {
        token,
        expiresAt: new Date(exp * 1000).toISOString(),
        user: { uid: member.uid, tenantId: member.tenant_id, role: member.role, displayName: member.display_name, email: member.email },
      });
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
        const provided = typeof body.password === 'string' && body.password.length >= 8 ? body.password : '';
        const temp = provided ? '' : tempPassword();
        const uid = `uid-${crypto.randomUUID()}`;
        const doc = {
          tenant_id: tenantId,
          uid,
          email,
          role,
          display_name: displayName || email.split('@')[0],
          password_hash: await hashPassword(provided || temp),
          status: 'active',
        };
        const { error } = await db.from('members').insert(doc);
        if (error) return json(500, { error: 'Could not create the user.' });
        return json(201, { member: toMember(doc), tempPassword: temp || undefined });
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
          const body = await readJson(req);
          const provided = typeof body.password === 'string' && body.password.length >= 8 ? body.password : '';
          const temp = provided ? '' : tempPassword();
          await db.from('members').update({ password_hash: await hashPassword(provided || temp) }).eq('tenant_id', tenantId).eq('uid', targetUid);
          return json(200, { ok: true, tempPassword: temp || undefined });
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
          criteria: body.criteria === 'ISO 14001:2015' ? 'ISO 14001:2015' : 'ISO 14001:2026',
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
          awareness: byKind('awareness'),
          documentedInfo: byKind('documentedInfo'),
          performanceMetrics: byKind('performanceMetric'),
          permits: byKind('permit'),
          incidents: byKind('incident'),
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

      if (method === 'PUT' && rest[0] === 'findings' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const finding = cleanFinding(body, requireId(rest[1]));
        await upsertRecord(tenantId, auditId, 'finding', finding.id, finding);
        return json(200, { finding });
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

      if (method === 'POST' && rest[0] === 'reports' && rest[1] === 'signoff') {
        requireRole(actor, ['leadAuditor']);
        const body = await readJson(req);
        const now = new Date().toISOString();
        const report = { id: `report-${auditId}`, status: 'signed', signedBy: actor.uid, signedAt: now, attestation: body.attestation };
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
        awareness: 'awareness',
        'documented-info': 'documentedInfo',
        'performance-metrics': 'performanceMetric',
        permits: 'permit',
        incidents: 'incident',
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
