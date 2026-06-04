import { ClauseGuide, clauseGuideFor } from './audit-guide.js';
import { StandardEdition, sharedClauseTitles } from './standards.js';

/** A single auditable clause row generated from the standard's clause set. */
export interface StandardChecklistRow {
  clauseId: string;
  clauseTitle: string;
  question: string;
  guidance?: string;
}

/**
 * A neutral, conformity-style prompt for a clause. Uses the clause identifier and
 * short title only — never verbatim ISO requirement text (copyright guardrail).
 */
function questionFor(clauseId: string, title: string): string {
  return `Is "${title}" (clause ${clauseId}) established, implemented and effective on site?`;
}

/** Compress the field-guide lenses into a one-line "what to look for / evidence" hint. */
function guidanceFor(guide: ClauseGuide | undefined): string | undefined {
  if (!guide) return undefined;
  const look = guide.whatToLookFor.length ? `Look for: ${guide.whatToLookFor.join(' ')}` : '';
  const evidence = guide.evidenceToRequest.length
    ? ` Evidence to request: ${guide.evidenceToRequest.join('; ')}.`
    : '';
  const text = `${look}${evidence}`.trim();
  return text.length ? text : undefined;
}

/**
 * Build a full audit checklist for an ISO 45001 edition: one row per clause in
 * the standards model (`sharedClauseTitles`), enriched with original,
 * Trainovate-authored field-guide guidance. Generated from clause identifiers,
 * short titles and original guidance only — no verbatim ISO requirement text.
 */
export function standardChecklist(edition: StandardEdition['id']): StandardChecklistRow[] {
  const ed = sharedClauseTitles.find((candidate) => candidate.id === edition) ?? sharedClauseTitles[0]!;
  return ed.clauses.map((clause) => ({
    clauseId: clause.clauseId,
    clauseTitle: clause.title,
    question: questionFor(clause.clauseId, clause.title),
    guidance: guidanceFor(clauseGuideFor(clause.clauseId)),
  }));
}

/** Map the human-facing audit criteria label (e.g. "ISO 45001:2018") to a standards edition id. */
export function editionFromCriteria(criteria: string): StandardEdition['id'] {
  return criteria.includes('2026') ? 'ISO_45001_2026' : 'ISO_45001_2018';
}
