// Pure, dependency-free security & validation helpers for the Supabase edge
// function. Kept in their own module (no Deno globals, no JSR imports) so the
// Node test suite can exercise the *deployed* backend's logic directly — the
// production function previously had no automated coverage. `index.ts` imports
// these with an explicit `.ts` extension (Deno); the tests import without one.

export class ValidationError extends Error {}

export const FINDING_GRADES = ['minorNc', 'majorNc', 'ofi', 'conformity'];
export const REGISTER_RESULTS = ['notStarted', 'conforming', 'nonconforming', 'notApplicable', 'needsFollowUp'];
// ISO 45001 cl. 10.2: CAPA action intent + recognised root-cause methods.
export const CAPA_INTENTS = ['correction', 'correctiveAction', 'preventiveAction'];
export const ROOT_CAUSE_METHODS = ['fiveWhys', 'fishbone', 'faultTree', 'other'];
// Client portal + provisioning.
export const EVIDENCE_REQUEST_STATUSES = ['requested', 'submitted', 'accepted', 'returned'];
export const TENANT_ROLES = ['tenantAdmin', 'leadAuditor', 'auditor', 'clientViewer'];
export const TENANT_PLANS = ['pilot', 'team', 'enterprise'];
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normEmail(value: unknown): string {
  return String(value ?? '').toLowerCase().trim();
}

export function str(value: unknown, max: number, field: string): string {
  const out = value == null ? '' : String(value);
  if (out.length > max) throw new ValidationError(`${field} exceeds ${max} characters.`);
  return out;
}

export function requireId(value: unknown): string {
  const id = str(value, 200, 'id').trim();
  if (!id) throw new ValidationError('A record id is required.');
  return id;
}

export function oneOf<T>(value: T, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value)) throw new ValidationError(`Invalid ${field}.`);
  return value;
}

export function cleanFinding(body: Record<string, unknown>, id: string): Record<string, unknown> {
  return {
    id,
    clauseId: str(body['clauseId'], 20, 'clauseId'),
    clauseTitle: str(body['clauseTitle'], 200, 'clauseTitle'),
    type: oneOf(body['type'], FINDING_GRADES, 'finding grade'),
    description: str(body['description'], 8000, 'description'),
    requirementSummary: str(body['requirementSummary'], 1000, 'requirementSummary'),
    objectiveEvidence: str(body['objectiveEvidence'], 8000, 'objectiveEvidence'),
    gradingRationale: str(body['gradingRationale'], 4000, 'gradingRationale'),
    systemic: body['systemic'] === true,
    evidenceIds: Array.isArray(body['evidenceIds']) ? body['evidenceIds'].map((v) => str(v, 200, 'evidenceId')) : [],
    status: str(body['status'], 40, 'status') || 'open',
    createdByName: str(body['createdByName'], 300, 'createdByName'),
    createdAt: str(body['createdAt'], 40, 'createdAt'),
    // Auditee portal response (acknowledgement + proposed correction).
    acknowledgedAt: str(body['acknowledgedAt'], 40, 'acknowledgedAt'),
    responseText: str(body['responseText'], 8000, 'responseText'),
  };
}

export function cleanCapa(body: Record<string, unknown>, id: string): Record<string, unknown> {
  // Effectiveness verification is lead-only and must go through /verify, so a
  // client-supplied "verified" is clamped to verificationDue here.
  const status = body['status'] === 'verified' ? 'verificationDue' : str(body['status'], 40, 'status') || 'open';
  const intent = CAPA_INTENTS.includes(body['intent'] as string) ? (body['intent'] as string) : 'correctiveAction';
  const rootCauseMethod = ROOT_CAUSE_METHODS.includes(body['rootCauseMethod'] as string)
    ? (body['rootCauseMethod'] as string)
    : undefined;
  return {
    id,
    findingId: str(body['findingId'], 200, 'findingId'),
    intent,
    correction: str(body['correction'], 4000, 'correction'),
    ...(rootCauseMethod ? { rootCauseMethod } : {}),
    rootCause: str(body['rootCause'], 4000, 'rootCause'),
    action: str(body['action'], 4000, 'action'),
    owner: str(body['owner'], 300, 'owner'),
    dueDate: str(body['dueDate'], 40, 'dueDate'),
    implementationEvidenceIds: Array.isArray(body['implementationEvidenceIds']) ? body['implementationEvidenceIds'] : [],
    verification: str(body['verification'], 4000, 'verification'),
    verificationEvidenceIds: Array.isArray(body['verificationEvidenceIds']) ? body['verificationEvidenceIds'] : [],
    status,
    createdAt: str(body['createdAt'], 40, 'createdAt'),
  };
}

export function cleanRegister(body: Record<string, unknown>, id: string): Record<string, unknown> {
  // Shared shape for aspects/obligations/emergency + the governance registers:
  // bounded strings plus a constrained auditor result. Unknown keys are dropped
  // (with bounded length), so the deployed store only ever holds vetted values.
  const out: Record<string, unknown> = { id, result: 'notStarted', updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(body ?? {})) {
    if (key === 'id' || key === 'sync' || key === 'updatedAt') continue;
    if (key === 'result') {
      out['result'] = REGISTER_RESULTS.includes(value as string) ? value : 'notStarted';
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'number') {
      // Numeric register fields (e.g. performance-metric values) are kept as
      // finite numbers, not stringified, so the deployed store holds real data.
      out[key] = Number.isFinite(value) ? value : 0;
    } else if (Array.isArray(value)) {
      // Bounded arrays (e.g. document attachments, obligation compliance-evaluation
      // history) are preserved: object items are shallow-cleaned to vetted scalar
      // fields; scalar items are stringified.
      out[key] = value.slice(0, 50).map((item) => cleanArrayItem(item));
    } else {
      out[key] = str(value, 2000, key);
    }
  }
  return out;
}

/** Shallow-sanitise an array item: objects keep scalar fields (bounded), scalars are stringified. */
function cleanArrayItem(item: unknown): unknown {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (typeof v === 'boolean') cleaned[k] = v;
      else if (typeof v === 'number') cleaned[k] = Number.isFinite(v) ? v : 0;
      else cleaned[k] = str(v, 2000, k);
    }
    return cleaned;
  }
  return str(item, 2000, 'item');
}

/** Sanitise the auditee-provided submissions on an evidence request (bounded). */
function cleanSubmissions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {
      id: requireId(s['id']),
      submittedByName: str(s['submittedByName'], 200, 'submittedByName'),
      submittedAt: str(s['submittedAt'], 40, 'submittedAt'),
    };
    if (s['fileName'] != null) out['fileName'] = str(s['fileName'], 300, 'fileName');
    if (s['mime'] != null) out['mime'] = str(s['mime'], 200, 'mime');
    if (typeof s['size'] === 'number' && Number.isFinite(s['size'])) out['size'] = s['size'];
    if (s['note'] != null) out['note'] = str(s['note'], 4000, 'note');
    return out;
  });
}

/** Sanitise the request thread messages (bounded). */
function cleanMessages(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((raw) => {
    const m = (raw ?? {}) as Record<string, unknown>;
    return {
      id: requireId(m['id']),
      author: m['author'] === 'auditor' ? 'auditor' : 'auditee',
      authorName: str(m['authorName'], 200, 'authorName'),
      body: str(m['body'], 4000, 'body'),
      at: str(m['at'], 40, 'at'),
    };
  });
}

/** Auditor-side evidence request: vetted fields + bounded submissions/messages. */
export function cleanEvidenceRequest(body: Record<string, unknown>, id: string): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id,
    title: str(body['title'], 300, 'title'),
    detail: str(body['detail'], 4000, 'detail'),
    status: EVIDENCE_REQUEST_STATUSES.includes(body['status'] as string) ? (body['status'] as string) : 'requested',
    createdByName: str(body['createdByName'], 200, 'createdByName'),
    createdAt: str(body['createdAt'], 40, 'createdAt'),
    updatedAt: new Date().toISOString(),
    submissions: cleanSubmissions(body['submissions']),
    messages: cleanMessages(body['messages']),
  };
  const clauseId = str(body['clauseId'], 40, 'clauseId');
  if (clauseId) out['clauseId'] = clauseId;
  const clauseTitle = str(body['clauseTitle'], 300, 'clauseTitle');
  if (clauseTitle) out['clauseTitle'] = clauseTitle;
  const dueDate = str(body['dueDate'], 40, 'dueDate');
  if (dueDate) out['dueDate'] = dueDate;
  return out;
}

/**
 * The auditee write boundary: a clientViewer may only append their own
 * submissions and post messages. Auditor-owned fields (title/clause/due/status)
 * are preserved from the stored record; status advances to "submitted" only when
 * fresh evidence is attached; and any *new* thread message is stamped as auditee
 * authorship (no impersonating the auditor).
 */
export function mergeAuditeeEvidenceRequest(
  existing: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const submissions = cleanSubmissions(body['submissions']);
  const priorSubs = Array.isArray(existing['submissions']) ? (existing['submissions'] as unknown[]) : [];
  const priorMessages = Array.isArray(existing['messages']) ? (existing['messages'] as Array<Record<string, unknown>>) : [];
  const priorIds = new Set(priorMessages.map((m) => m && m['id']));
  const messages = cleanMessages(body['messages']).map((m) => (priorIds.has(m['id']) ? m : { ...m, author: 'auditee' }));
  const grew = submissions.length > priorSubs.length;
  return {
    ...existing,
    submissions,
    messages,
    status: grew ? 'submitted' : existing['status'],
    updatedAt: new Date().toISOString(),
  };
}

/** Validate a superadmin "provision client" command (tenant + lead auditor + client users). */
export function cleanProvisionClient(body: Record<string, unknown>): {
  tenantName: string;
  plan: string;
  leadAuditor: { email: string; displayName: string };
  clientUsers: Array<{ email: string; displayName: string; role: string }>;
} {
  const tenantName = str(body['tenantName'], 300, 'tenantName').trim();
  if (!tenantName) throw new ValidationError('A client/tenant name is required.');
  const plan = TENANT_PLANS.includes(body['plan'] as string) ? (body['plan'] as string) : 'pilot';
  const la = (body['leadAuditor'] ?? {}) as Record<string, unknown>;
  const leadAuditor = { email: normEmail(la['email']), displayName: str(la['displayName'], 200, 'displayName').trim() };
  if (!EMAIL_RE.test(leadAuditor.email)) throw new ValidationError('A valid lead auditor email is required.');
  const rawUsers = Array.isArray(body['clientUsers']) ? (body['clientUsers'] as unknown[]) : [];
  const clientUsers = rawUsers
    .slice(0, 50)
    .map((raw) => {
      const u = (raw ?? {}) as Record<string, unknown>;
      const role = TENANT_ROLES.includes(u['role'] as string) ? (u['role'] as string) : 'clientViewer';
      return { email: normEmail(u['email']), displayName: str(u['displayName'], 200, 'displayName').trim(), role };
    })
    .filter((u) => EMAIL_RE.test(u.email));
  return { tenantName, plan, leadAuditor, clientUsers };
}

/**
 * Resolve the CORS `access-control-allow-origin` value: reflect the request
 * origin only when it is in the configured allow-list, otherwise fall back to
 * the first configured origin. Never returns `*` — that would let any site call
 * the API with a victim's bearer token (the function runs verify_jwt=false).
 */
export function resolveCorsOrigin(origin: string, allowed: readonly string[]): string {
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] ?? '';
}

/** The app JWT must be signed with a dedicated secret — never the service-role key. */
export function isAuthConfigured(secret: string | undefined): boolean {
  return typeof secret === 'string' && secret.length > 0;
}
