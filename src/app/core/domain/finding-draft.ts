/**
 * Finding-draft generation. The rule-based composer turns a non-conformity the
 * auditor is recording into a first-draft nonconformity statement, a requirement
 * summary, the objective evidence, a suggested grade and root-cause prompts the
 * auditor reviews and edits before issuing. It is deterministic, runs offline,
 * and — like the field guide and the report draft — uses clause identifiers /
 * titles, the finding's own data and ORIGINAL field-guide content only, never
 * verbatim ISO requirement text (copyright guardrail: no word "shall").
 *
 * The same `FindingDraft` shape is what a server-side LLM provider returns, so a
 * real Claude/Vertex generator can be swapped in behind the same boundary
 * (`source: 'ai'`) without changing the client or the findings screen.
 */

import { clauseGuideFor } from './audit-guide.js';

export type FindingDraftResult = 'minorNc' | 'majorNc' | 'ofi' | 'conform' | 'na' | 'notStarted' | string;
export type FindingDraftType = 'majorNc' | 'minorNc' | 'ofi';

export interface FindingDraftInput {
  clauseId: string;
  clauseTitle: string;
  /** The auditor's free-text note / observation captured against the clause. */
  note?: string;
  /** The recorded result that prompted the finding. */
  result: FindingDraftResult;
  /** Labels of evidence (notes, photos) linked to the finding. */
  evidenceLabels?: string[];
}

export interface FindingDraft {
  draftStatement: string;
  requirementSummary: string;
  objectiveEvidence: string;
  suggestedType: FindingDraftType;
  gradingRationale: string;
  rootCausePrompts: string[];
  source: 'ruleBased' | 'ai';
  generatedAt: string;
}

/** Map the recorded result onto a suggested grade. */
function suggestType(result: FindingDraftResult): FindingDraftType {
  if (result === 'majorNc') return 'majorNc';
  if (result === 'ofi') return 'ofi';
  // Minor NC, plus any other non-conforming result, defaults to a minor grade for review.
  return 'minorNc';
}

const TYPE_LABEL: Record<FindingDraftType, string> = {
  majorNc: 'major nonconformity',
  minorNc: 'minor nonconformity',
  ofi: 'opportunity for improvement',
};

/**
 * Compose a first-draft finding from the finding's own data plus the clause
 * field guide. Pure and deterministic — pass `now` to make the timestamp
 * reproducible in tests.
 */
export function composeFindingDraft(input: FindingDraftInput, now: string = new Date().toISOString()): FindingDraft {
  const guide = clauseGuideFor(input.clauseId);
  const clauseRef = `clause ${input.clauseId} — ${input.clauseTitle}`;
  const suggestedType = suggestType(input.result);
  const typeLabel = TYPE_LABEL[suggestedType];

  const note = input.note?.trim();
  const evidence = (input.evidenceLabels ?? []).map((label) => label.trim()).filter(Boolean);

  // --- Requirement summary (from the field-guide purpose, never verbatim ISO text) ---
  const requirementSummary = guide
    ? `Cl. ${input.clauseId} (${guide.title}) expects: ${guide.purpose}`
    : `Cl. ${input.clauseId} — ${input.clauseTitle}: management-system arrangements expected for this clause area.`;

  // --- Objective evidence (the note + any linked evidence labels) ---
  const evidenceParts: string[] = [];
  if (note) evidenceParts.push(note);
  if (evidence.length) evidenceParts.push(`Linked evidence: ${evidence.join('; ')}.`);
  const objectiveEvidence = evidenceParts.length
    ? evidenceParts.join(' ')
    : `Objective evidence to be recorded for ${clauseRef} (records, observations and interviews the finding rests on).`;

  // --- Draft nonconformity statement (requirement + evidence + gap, clause-referenced) ---
  const gap = note
    ? `the arrangements observed did not fully meet what ${clauseRef} expects`
    : `a gap against what ${clauseRef} expects was observed`;
  const draftStatement =
    suggestedType === 'ofi'
      ? `Against ${clauseRef}, an opportunity to strengthen the OH&S management system was identified${note ? `: ${note}` : '.'} ` +
        `This is advisory and is not a non-fulfilment of a requirement.`
      : `Against ${clauseRef}, ${gap}. ` +
        `Objective evidence: ${note ? note : 'to be recorded.'} ` +
        `Graded as a ${typeLabel} pending lead-auditor review.`;

  // --- Grading rationale (from the grading-guide intent, in our own words) ---
  let gradingRationale: string;
  if (suggestedType === 'majorNc') {
    gradingRationale =
      `Suggested major: on the evidence the ability of the OH&S management system to achieve its intended results at ${clauseRef} ` +
      `is in doubt (e.g. a breakdown of a required arrangement, or a systemic or high-risk gap). Confirm against the grading guide before issuing.`;
  } else if (suggestedType === 'ofi') {
    gradingRationale =
      `Suggested OFI: a suggestion that would strengthen arrangements at ${clauseRef} rather than a non-fulfilment of a requirement. ` +
      `Confirm against the grading guide before issuing.`;
  } else {
    gradingRationale =
      `Suggested minor: an isolated lapse at ${clauseRef} that does not undermine the OH&S management system overall. ` +
      `Re-grade to major if it is systemic, high-risk or a total breakdown of the arrangement. Confirm before issuing.`;
  }

  // --- Root-cause prompts (questions for the auditee's investigation) ---
  const rootCausePrompts: string[] = [];
  rootCausePrompts.push(`Why did the gap at ${clauseRef} arise, and how far back does the cause go?`);
  rootCausePrompts.push('Was the arrangement defined but not followed, or not defined in the first place?');
  if (guide?.questionsToAsk?.length) {
    rootCausePrompts.push(`To test the cause, ask: ${guide.questionsToAsk[0]}`);
  }
  if (guide?.typicalNonconformities?.length) {
    rootCausePrompts.push(`Is this an instance of a typical gap here — e.g. ${guide.typicalNonconformities[0]}?`);
  }
  rootCausePrompts.push('Could the same cause affect other areas, shifts, sites or clauses (is it systemic)?');
  rootCausePrompts.push('What correction makes it safe now, and what corrective action would stop it recurring?');

  return {
    draftStatement,
    requirementSummary,
    objectiveEvidence,
    suggestedType,
    gradingRationale,
    rootCausePrompts,
    source: 'ruleBased',
    generatedAt: now,
  };
}
