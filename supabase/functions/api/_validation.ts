// Pure, dependency-free security & validation helpers for the Supabase edge
// function. Kept in their own module (no Deno globals, no JSR imports) so the
// Node test suite can exercise the *deployed* backend's logic directly — the
// production function previously had no automated coverage. `index.ts` imports
// these with an explicit `.ts` extension (Deno); the tests import without one.

export class ValidationError extends Error {}

export const FINDING_GRADES = ['minorNc', 'majorNc', 'ofi', 'conformity'];
export const REGISTER_RESULTS = ['notStarted', 'conforming', 'nonconforming', 'notApplicable', 'needsFollowUp'];

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
  };
}

export function cleanCapa(body: Record<string, unknown>, id: string): Record<string, unknown> {
  // Effectiveness verification is lead-only and must go through /verify, so a
  // client-supplied "verified" is clamped to verificationDue here.
  const status = body['status'] === 'verified' ? 'verificationDue' : str(body['status'], 40, 'status') || 'open';
  return {
    id,
    findingId: str(body['findingId'], 200, 'findingId'),
    correction: str(body['correction'], 4000, 'correction'),
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
    } else {
      out[key] = str(value, 2000, key);
    }
  }
  return out;
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
