import { AUDIT_METHODOLOGY, CLAUSE_FIELD_GUIDE, ClauseGuide, GRADING_GUIDE } from './audit-guide.js';

/**
 * Offline "ask the standard" copilot. It answers an auditor's clause questions
 * from the in-app field guide (original Trainovate content — clause identifiers
 * and short titles only, never verbatim ISO requirement text), with no model and
 * no network. The same `ClauseAnswer` shape is what a server-side LLM (RAG)
 * provider returns, so a real Claude/Vertex answerer can be swapped in behind the
 * same boundary (`source: 'ai'`) without changing the copilot screen.
 */

export interface CopilotClauseRef {
  clauseId: string;
  title: string;
}

export interface ClauseAnswer {
  answer: string;
  clauseRefs: CopilotClauseRef[];
  source: 'fieldGuide' | 'ai';
}

export const COPILOT_SUGGESTIONS: string[] = [
  'What should I look for under 6.1.2 hazard identification?',
  'When is a finding a major vs a minor nonconformity?',
  'What evidence proves worker consultation (5.4)?',
  'How do I audit management of change?',
  'What does the hierarchy of controls require me to check?',
];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'what', 'when', 'how', 'should', 'with', 'this', 'that', 'does', 'under',
  'about', 'into', 'from', 'you', 'your', 'auditor', 'audit', 'clause', 'iso', 'look', 'check', 'evidence',
  'requirement', 'requirements', 'show', 'tell', 'need', 'needs', 'must', 'can', 'where', 'which', 'who',
]);

const GRADING_TOKENS = new Set(['major', 'minor', 'ofi', 'grade', 'grading', 'nonconformity', 'nonconformities', 'classify']);

function searchText(entry: ClauseGuide): string {
  return [
    entry.clauseId,
    entry.title,
    entry.purpose,
    ...entry.whatToLookFor,
    ...entry.evidenceToRequest,
    ...entry.questionsToAsk,
    ...entry.typicalNonconformities,
  ]
    .join(' ')
    .toLowerCase();
}

function clauseIdsIn(question: string): string[] {
  return [...question.matchAll(/\b\d+(?:\.\d+){0,3}\b/g)].map((m) => m[0]);
}

function keywordTokens(question: string): string[] {
  return (question.toLowerCase().match(/[a-z]+/g) ?? []).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function composeClauseAnswer(entry: ClauseGuide): string {
  return (
    `Clause ${entry.clauseId} — ${entry.title}. ${entry.purpose} ` +
    `What to look for: ${entry.whatToLookFor.join('; ')}. ` +
    `Evidence to request: ${entry.evidenceToRequest.join('; ')}. ` +
    `Questions to ask: ${entry.questionsToAsk.join('; ')}. ` +
    `Typical nonconformities: ${entry.typicalNonconformities.join('; ')}.`
  );
}

function gradingAnswer(): string {
  return GRADING_GUIDE.map(
    (g) => `${g.label}: ${g.when} e.g. ${g.examples[0]}${g.timeline ? ` (${g.timeline})` : ''}`,
  ).join(' ');
}

/**
 * Answer a clause question from the field guide. Scores every clause by explicit
 * clause-number mentions and keyword overlap, then composes an answer from the
 * best match plus a couple of related clauses. Pure and deterministic.
 */
export function answerFromFieldGuide(question: string): ClauseAnswer {
  const ids = clauseIdsIn(question);
  const tokens = keywordTokens(question);

  const scored = CLAUSE_FIELD_GUIDE.map((entry) => {
    const text = searchText(entry);
    let score = 0;
    if (ids.includes(entry.clauseId)) score += 100;
    if (ids.some((id) => entry.clauseId === id || entry.clauseId.startsWith(`${id}.`))) score += 20;
    for (const token of tokens) {
      if (entry.title.toLowerCase().includes(token)) score += 5;
      else if (text.includes(token)) score += 1;
    }
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const wantsGrading = tokens.some((t) => GRADING_TOKENS.has(t));

  if (!scored.length) {
    if (wantsGrading) {
      return { answer: gradingAnswer(), clauseRefs: [], source: 'fieldGuide' };
    }
    return {
      answer:
        "I couldn't match that to a specific clause. Try a clause number (e.g. 6.1.2) or a topic such as " +
        "'hazard identification', 'competence', 'worker consultation' or 'management review'. The field guide covers ISO 45001 clauses 4–10.",
      clauseRefs: [],
      source: 'fieldGuide',
    };
  }

  const primary = scored[0]!.entry;
  const related = scored.slice(1, 3).map((s) => s.entry);
  const gradingNote = wantsGrading ? ` Grading: ${gradingAnswer()}` : '';

  return {
    answer: `${composeClauseAnswer(primary)}${gradingNote}`,
    clauseRefs: [primary, ...related].map((e) => ({ clauseId: e.clauseId, title: e.title })),
    source: 'fieldGuide',
  };
}

/** Stage titles from the methodology, for the copilot's "how do I run X" prompts. */
export function methodologyStageTitles(): string[] {
  return AUDIT_METHODOLOGY.map((stage) => stage.title);
}
