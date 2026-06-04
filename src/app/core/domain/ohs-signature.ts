/**
 * Tamper-evident electronic signature for the audit report (ISO 45001 cl. 7.5.3
 * control of documented information; ISO 19011 reporting). The signature binds
 * the signer's identity, role, timestamp and attestation to a SHA-256 digest of
 * the report content at the moment of signing, so any later edit is detectable
 * when the digest is recomputed and compared.
 *
 * Scope note: this provides content-integrity + auditor attestation (a valid
 * "simple electronic signature"). It is NOT a PKI / qualified e-signature —
 * cryptographic identity binding (certificates, HSM, trusted timestamping)
 * requires external infrastructure and is intentionally out of scope here.
 */

export interface ReportSignature {
  /** Display name of the signer (lead auditor). */
  signerName: string;
  signerUid: string;
  signerRole: string;
  /** ISO timestamp the signature was applied. */
  signedAt: string;
  /** The auditor's attestation statement. */
  attestation: string;
  /** Lowercase hex SHA-256 of the canonical signed content (the integrity fingerprint). */
  contentHash: string;
  /** Algorithm + canonicalisation version, so verification stays reproducible. */
  algorithm: 'SHA-256';
  hashVersion: 1;
}

/** The minimal, order-stable view of the report that the signature attests to. */
export interface SignableReport {
  auditee: string;
  criteria: string;
  scope?: string;
  auditType?: string;
  overallConformity?: string;
  recommendation?: string;
  findings: { id: string; type: string; clauseId: string; status: string; description?: string }[];
}

/**
 * Build the canonical string that gets hashed. Deterministic and field-ordered so
 * the same report always yields the same digest regardless of object key order;
 * findings are sorted by id. Versioned via the `v1:` prefix.
 */
export function canonicalReportContent(report: SignableReport): string {
  const findings = [...report.findings]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => [f.id, f.type, f.clauseId, f.status, (f.description ?? '').trim()].join('␟'))
    .join('␞');
  return [
    'v1',
    (report.auditee ?? '').trim(),
    (report.criteria ?? '').trim(),
    (report.scope ?? '').trim(),
    (report.auditType ?? '').trim(),
    (report.overallConformity ?? '').trim(),
    (report.recommendation ?? '').trim(),
    findings,
  ].join('‖');
}

/** Hex-encode bytes. */
function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * SHA-256 of a string as lowercase hex. Uses Web Crypto when available (browser
 * and modern Node via `globalThis.crypto.subtle`); the caller awaits the result.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SubtleCrypto is unavailable in this environment.');
  const digest = await subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

/** Compute the integrity fingerprint of a report (canonicalise → SHA-256 hex). */
export function reportContentHash(report: SignableReport): Promise<string> {
  return sha256Hex(canonicalReportContent(report));
}

/**
 * Verify a signature against the current report content: recompute the hash and
 * compare. A mismatch means the report changed after signing (tampered/edited).
 */
export async function verifyReportSignature(
  signature: Pick<ReportSignature, 'contentHash'>,
  report: SignableReport,
): Promise<boolean> {
  const current = await reportContentHash(report);
  return current === signature.contentHash;
}

/** Short, human-friendly fingerprint for display (first 12 hex chars, spaced). */
export function shortFingerprint(hash: string): string {
  return (hash.slice(0, 12).match(/.{1,4}/g) ?? []).join(' ').toUpperCase();
}
