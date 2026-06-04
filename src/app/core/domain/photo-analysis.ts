/**
 * AI photo-evidence analysis — the auditor-review gate.
 *
 * A server-side vision model (Claude) inspects a captured site photo and returns
 * *candidate* observations, hazard tags, a suggested clause and a suggested
 * finding statement. Nothing here is auto-applied: the result lands in a
 * `needsAuditorReview` state and only becomes a finding once the auditor
 * explicitly accepts it (reusing the existing finding path). This mirrors the
 * report-draft AI scaffold: the same result shape is produced whether the model
 * runs or not, and the feature degrades gracefully when the key/model are unset
 * (a clear `aiNotConfigured` status, never a silent failure).
 *
 * Like the report draft, the prompt and the normalized output carry only clause
 * identifiers/short titles and the auditor's own observations — never verbatim
 * ISO requirement text (copyright guardrail).
 *
 * This module is pure (no Angular, no I/O) so the normalizer and the
 * accept→finding mapping can be unit-tested in isolation.
 */

/** Lifecycle of a per-photo analysis request, as surfaced to the review UI. */
export type PhotoAnalysisStatus =
  | 'processing'
  | 'needsAuditorReview'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'aiNotConfigured';

/** Finding grades the auditor can promote a candidate to (matches FindingType). */
export type PhotoAnalysisFindingType = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';

const FINDING_TYPES: readonly PhotoAnalysisFindingType[] = ['minorNc', 'majorNc', 'ofi', 'conformity'];

/**
 * The normalized, review-ready candidate the model returns for one photo. This
 * is the strict-JSON contract both backends emit and the store stores; it is a
 * subset/projection of the richer `photoAiAnalysisSchema` shape, kept minimal so
 * the review-gate UI has exactly what it needs to render and promote.
 */
export interface PhotoAnalysisCandidate {
  /** Candidate observations the auditor may turn into evidence/finding text. */
  observations: string[];
  /** Short hazard tags (e.g. "blocked egress", "missing guard"). */
  hazardTags: string[];
  /** Suggested ISO 45001 clause identifier (e.g. "8.1.2"), if the model offered one. */
  suggestedClauseId?: string;
  /** A drafted, plain-language finding statement for the auditor to edit. */
  suggestedFindingStatement?: string;
  /** Suggested grade; defaults to an OFI so acceptance never over-states severity. */
  suggestedType: PhotoAnalysisFindingType;
}

/** The full analysis record held against a photo, including its review state. */
export interface PhotoAnalysisResult {
  status: PhotoAnalysisStatus;
  /** Present once the model has returned a `needsAuditorReview` candidate. */
  candidate?: PhotoAnalysisCandidate;
  provider: 'anthropicClaude';
  /** Who/when the auditor accepted or rejected (review attribution). */
  reviewedByName?: string;
  reviewedAt?: string;
  /** Human-readable reason when status is `failed`. */
  failureReason?: string;
  requestedAt: string;
}

/** A finding draft produced when the auditor accepts a candidate. */
export interface PhotoAnalysisFindingDraft {
  clauseId: string;
  type: PhotoAnalysisFindingType;
  description: string;
}

function asTrimmedStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed) out.push(trimmed);
    if (out.length >= max) break;
  }
  // De-duplicate while preserving order.
  return [...new Set(out)];
}

function asOptionalClauseId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  // Clause identifiers are short dotted numerics (e.g. "8", "8.1", "8.1.2").
  return /^\d+(\.\d+)*$/.test(trimmed) ? trimmed : undefined;
}

function asFindingType(value: unknown): PhotoAnalysisFindingType {
  return typeof value === 'string' && (FINDING_TYPES as readonly string[]).includes(value)
    ? (value as PhotoAnalysisFindingType)
    : 'ofi';
}

/**
 * Validate + normalize the raw JSON object a vision model returns into a
 * review-ready candidate. Tolerant of missing/extra keys and bad types: anything
 * unusable is dropped rather than thrown, so a partial model response still
 * yields a reviewable (if sparse) candidate. The copyright guardrail is enforced
 * defensively here too — any string containing the word "shall" is stripped, so
 * verbatim requirement text never reaches the auditor or the finding.
 */
export function normalizePhotoAnalysisPayload(raw: unknown): PhotoAnalysisCandidate {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dropRequirementText = (text: string): boolean => !/\bshall\b/i.test(text);

  const observations = asTrimmedStringArray(obj['observations'], 12).filter(dropRequirementText);
  const hazardTags = asTrimmedStringArray(obj['hazardTags'], 12).filter(dropRequirementText);
  const suggestedClauseId = asOptionalClauseId(obj['suggestedClauseId']);

  let suggestedFindingStatement: string | undefined;
  const rawStatement = obj['suggestedFindingStatement'];
  if (typeof rawStatement === 'string') {
    const trimmed = rawStatement.trim();
    if (trimmed && dropRequirementText(trimmed)) suggestedFindingStatement = trimmed;
  }

  return {
    observations,
    hazardTags,
    suggestedClauseId,
    suggestedFindingStatement,
    suggestedType: asFindingType(obj['suggestedType']),
  };
}

/** True when a normalized candidate carries something an auditor can review. */
export function hasReviewableContent(candidate: PhotoAnalysisCandidate): boolean {
  return (
    candidate.observations.length > 0 ||
    candidate.hazardTags.length > 0 ||
    !!candidate.suggestedFindingStatement
  );
}

/**
 * Map an auditor-accepted candidate onto a finding draft. The description prefers
 * the suggested statement, falling back to the observations/hazard tags so an
 * accept never produces an empty finding. The clause defaults to "8.1.2"
 * (operational planning & control — the usual home for a site-condition hazard)
 * when the model offered none, so the finding is always clause-anchored.
 */
export function analysisCandidateToFinding(
  candidate: PhotoAnalysisCandidate,
): PhotoAnalysisFindingDraft {
  const description =
    candidate.suggestedFindingStatement ??
    (candidate.observations.length
      ? candidate.observations.join('; ')
      : candidate.hazardTags.length
        ? `Hazard(s) observed: ${candidate.hazardTags.join(', ')}.`
        : 'Auditor accepted an AI photo-analysis candidate for follow-up.');

  return {
    clauseId: candidate.suggestedClauseId ?? '8.1.2',
    type: candidate.suggestedType,
    description,
  };
}
