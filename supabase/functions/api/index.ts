// Supabase Edge Function: ISO 14001 audit API.
// Mirrors the original Node/Mongo `/api` contract over Postgres JSONB tables.
// Custom auth (HS256 app JWT + PBKDF2 passwords via Web Crypto); deployed with
// verify_jwt=false so the app's own bearer token passes through unmodified.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('APP_JWT_SECRET') ?? SERVICE_ROLE;
const JWT_TTL = 43200; // 12h

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,apikey,x-app-token',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(body === null ? 'null' : JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

// ---- crypto helpers (Web Crypto) ----
const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
  const bin = atob(norm + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signJwt(payload: Record<string, unknown>): Promise<{ token: string; exp: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + JWT_TTL;
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: nowSec, exp })));
  const data = `${header}.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(JWT_SECRET), enc.encode(data)));
  return { token: `${data}.${b64url(sig)}`, exp };
}
async function verifyJwt(token: string): Promise<Record<string, unknown>> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('malformed');
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(JWT_SECRET), b64urlToBytes(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('signature');
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as Record<string, unknown>;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
  return payload;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
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

interface Actor {
  uid: string;
  tenantId: string;
  role: string;
  platform: boolean;
}
class AuthError extends Error {}

async function getActor(req: Request): Promise<Actor> {
  const authz = req.headers.get('authorization') ?? req.headers.get('x-app-token') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : authz.trim();
  if (!token) throw new AuthError('Missing token');
  let claims: Record<string, unknown>;
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
function requireTenant(actor: Actor, tenantId: string): void {
  if (actor.platform || actor.tenantId !== tenantId) throw new AuthError('Wrong tenant');
}
function requireRole(actor: Actor, roles: string[]): void {
  if (!roles.includes(actor.role)) throw new AuthError('Role not allowed');
}

// ---- record helpers ----
async function listRecords(tenantId: string, auditId: string) {
  const { data } = await db.from('field_records').select('kind,doc').eq('tenant_id', tenantId).eq('audit_id', auditId);
  return data ?? [];
}
async function getRecord(tenantId: string, auditId: string, kind: string, recordId: string) {
  const { data } = await db
    .from('field_records')
    .select('doc')
    .eq('tenant_id', tenantId)
    .eq('audit_id', auditId)
    .eq('kind', kind)
    .eq('record_id', recordId)
    .maybeSingle();
  return (data?.doc as Record<string, unknown> | undefined) ?? null;
}
async function upsertRecord(tenantId: string, auditId: string, kind: string, recordId: string, doc: unknown) {
  await db
    .from('field_records')
    .upsert(
      { tenant_id: tenantId, audit_id: auditId, kind, record_id: recordId, doc, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,audit_id,kind,record_id' },
    );
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

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
      const { data: member } = await db.from('members').select('*').ilike('email', email).maybeSingle();
      if (
        !member ||
        member.status !== 'active' ||
        typeof member.password_hash !== 'string' ||
        !(await verifyPassword(password, member.password_hash))
      ) {
        return json(401, { error: 'Invalid email or password.' });
      }
      const { token, exp } = await signJwt({ sub: member.uid, tenantId: member.tenant_id, role: member.role, platform: false });
      return json(200, {
        token,
        expiresAt: new Date(exp * 1000).toISOString(),
        user: { uid: member.uid, tenantId: member.tenant_id, role: member.role, displayName: member.display_name, email: member.email },
      });
    }

    // Tenant-scoped programme: /tenants/:t/programme
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

    // Audit-scoped: /tenants/:t/audits/:a/...
    if (seg[0] === 'tenants' && seg[2] === 'audits') {
      const tenantId = seg[1];
      const auditId = seg[3];
      const rest = seg.slice(4);
      const actor = await getActor(req);
      requireTenant(actor, tenantId);

      if (method === 'GET' && rest[0] === 'field-state') {
        const rows = await listRecords(tenantId, auditId);
        const byKind = (k: string) => rows.filter((r) => r.kind === k).map((r) => r.doc);
        const single = (k: string) => rows.find((r) => r.kind === k)?.doc ?? null;
        const statusDoc = single('status') as { status?: string } | null;
        return json(200, {
          items: byKind('checklist'),
          evidence: byKind('evidence'),
          findings: byKind('finding'),
          capas: byKind('capa'),
          aspects: byKind('aspect'),
          obligations: byKind('obligation'),
          emergencyRecords: byKind('emergency'),
          meetings: byKind('meeting'),
          conclusion: single('conclusion'),
          auditStatus: statusDoc?.status ?? 'fieldwork',
        });
      }

      if (method === 'PUT' && rest[0] === 'checklist' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const existing = (await getRecord(tenantId, auditId, 'checklist', rest[1])) ?? { id: rest[1] };
        const merged = { ...existing, result: body.result, note: body.note ?? null, updatedAt: new Date().toISOString() };
        await upsertRecord(tenantId, auditId, 'checklist', rest[1], merged);
        return json(200, { ok: true });
      }

      if (method === 'POST' && rest[0] === 'evidence') {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const id = String(body.id);
        await upsertRecord(tenantId, auditId, 'evidence', id, { ...body, createdBy: actor.uid });
        const itemId = body.itemId ? String(body.itemId) : '';
        if (itemId) {
          const item = await getRecord(tenantId, auditId, 'checklist', itemId);
          if (item) {
            const ids = Array.isArray(item.evidenceIds) ? (item.evidenceIds as string[]) : [];
            if (!ids.includes(id)) ids.push(id);
            await upsertRecord(tenantId, auditId, 'checklist', itemId, { ...item, evidenceIds: ids });
          }
        }
        return json(201, { evidence: body });
      }

      if (method === 'PUT' && rest[0] === 'findings' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        await upsertRecord(tenantId, auditId, 'finding', rest[1], body);
        return json(200, { finding: body });
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
        return json(200, { ok: true });
      }

      if (method === 'PUT' && rest[0] === 'capa' && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        const status = body.status === 'verified' ? 'verificationDue' : body.status;
        await upsertRecord(tenantId, auditId, 'capa', rest[1], { ...body, status });
        return json(200, { capa: { ...body, status } });
      }

      if (method === 'PUT' && rest[0] === 'status') {
        requireRole(actor, ['leadAuditor']);
        const body = await readJson(req);
        await upsertRecord(tenantId, auditId, 'status', 'status', { status: body.status });
        return json(200, { ok: true });
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

      if (method === 'POST' && rest[0] === 'reports' && rest[1] === 'signoff') {
        requireRole(actor, ['leadAuditor']);
        const body = await readJson(req);
        const now = new Date().toISOString();
        const report = { id: `report-${auditId}`, status: 'signed', signedBy: actor.uid, signedAt: now, attestation: body.attestation };
        await upsertRecord(tenantId, auditId, 'report', report.id, report);
        return json(200, { signedAt: now, report });
      }

      const registerKinds: Record<string, string> = { aspects: 'aspect', obligations: 'obligation', emergency: 'emergency' };
      if (method === 'PUT' && registerKinds[rest[0]] && rest[1]) {
        requireRole(actor, ['leadAuditor', 'auditor']);
        const body = await readJson(req);
        await upsertRecord(tenantId, auditId, registerKinds[rest[0]], rest[1], body);
        return json(200, { record: body });
      }
    }

    return json(404, { error: 'Route not found.' });
  } catch (error) {
    if (error instanceof AuthError) return json(401, { error: error.message });
    console.error('api error', error);
    return json(500, { error: 'Unexpected backend error.' });
  }
});
