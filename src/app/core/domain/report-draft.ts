/**
 * Audit-report draft generation. The rule-based composer turns the audit's own
 * data (checklist results, findings, evidence) into a first-draft narrative the
 * lead auditor reviews and edits before signing. It is deterministic, runs
 * offline, and — like the field guide — uses clause identifiers/titles and the
 * audit's data only, never verbatim ISO requirement text (copyright guardrail).
 *
 * The same `ReportDraft` shape is what a server-side LLM provider returns, so a
 * real Claude/Vertex generator can be swapped in behind the same boundary
 * (`source: 'ai'`) without changing the client or the report screen.
 */

export type DraftResult = 'notStarted' | 'conform' | 'minorNc' | 'majorNc' | 'ofi' | 'na';
export type DraftFindingType = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';
export type DraftRecommendation =
  | 'recommend'
  | 'conditional'
  | 'notRecommended'
  | 'satisfactory'
  | 'actionRequired';

export interface ReportDraftInput {
  auditee: string;
  criteria: string;
  /** Human label for the audit type, e.g. "Surveillance". */
  auditTypeLabel: string;
  checklist: { clauseId: string; clauseTitle: string; result: DraftResult }[];
  findings: { type: DraftFindingType; clauseId: string; clauseTitle: string; status: string }[];
  evidenceCount: number;
  overdueCapaCount: number;
}

export interface ReportDraft {
  overallConformity: string;
  emsEffectivenessOpinion: string;
  criteriaMetStatement: string;
  recommendation: DraftRecommendation;
  source: 'ruleBased' | 'ai';
  generatedAt: string;
}

const CLOSED_STATUSES = new Set(['closed', 'verified', 'rejected']);

function topSection(clauseId: string): string {
  return clauseId.split('.')[0] ?? clauseId;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function listClauses(ids: string[]): string {
  const unique = [...new Set(ids)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  return unique.join(', ');
}

/**
 * Compose a first-draft audit report from the audit data. Pure and
 * deterministic — pass `now` to make the timestamp reproducible in tests.
 */
export function composeReportDraft(input: ReportDraftInput, now: string = new Date().toISOString()): ReportDraft {
  const total = input.checklist.length;
  const answered = input.checklist.filter((c) => c.result !== 'notStarted').length;
  const unanswered = total - answered;
  const conform = input.checklist.filter((c) => c.result === 'conform').length;

  const majorNc = input.findings.filter((f) => f.type === 'majorNc').length;
  const minorNc = input.findings.filter((f) => f.type === 'minorNc').length;
  const ofi = input.findings.filter((f) => f.type === 'ofi').length;
  const openNc = input.findings.filter(
    (f) => (f.type === 'majorNc' || f.type === 'minorNc') && !CLOSED_STATUSES.has(f.status),
  ).length;
  const ncClauses = input.findings
    .filter((f) => f.type === 'majorNc' || f.type === 'minorNc')
    .map((f) => f.clauseId);

  // Sections (top-level clauses) that were fully answered with no nonconformity.
  const ncSections = new Set(ncClauses.map(topSection));
  const sectionAnswered = new Map<string, { total: number; answered: number }>();
  for (const item of input.checklist) {
    const key = topSection(item.clauseId);
    const acc = sectionAnswered.get(key) ?? { total: 0, answered: 0 };
    acc.total += 1;
    if (item.result !== 'notStarted') acc.answered += 1;
    sectionAnswered.set(key, acc);
  }
  const conformingSections = [...sectionAnswered.entries()]
    .filter(([key, acc]) => acc.answered === acc.total && acc.total > 0 && !ncSections.has(key))
    .map(([key]) => key);

  const recommendation: DraftRecommendation =
    majorNc > 0 ? 'actionRequired' : minorNc > 0 ? 'conditional' : 'recommend';

  // --- Overall conformity (executive summary + verdict + positive practices) ---
  const lead =
    `This ${input.auditTypeLabel.toLowerCase()} audit of ${input.auditee}'s occupational health & safety ` +
    `management system against ${input.criteria} sampled ${answered} of ${plural(total, 'clause area', 'clause areas')} ` +
    `across ISO 45001 clauses 4–10, examining ${plural(input.evidenceCount, 'item', 'items')} of objective evidence.`;
  let verdict: string;
  if (majorNc > 0) {
    verdict =
      ` ${plural(majorNc, 'major nonconformity was', 'major nonconformities were')} identified, so the management ` +
      `system did not fully meet the audit criteria at the time of the audit; correction and corrective action are ` +
      `required before conformity can be confirmed.`;
  } else if (minorNc > 0) {
    verdict =
      ` The management system broadly met the audit criteria, with ${plural(minorNc, 'minor nonconformity', 'minor nonconformities')}` +
      `${ofi > 0 ? ` and ${plural(ofi, 'opportunity for improvement', 'opportunities for improvement')}` : ''} raised for action.`;
  } else if (total > 0 && unanswered === 0) {
    verdict =
      ` The management system met the audit criteria across the areas sampled` +
      `${ofi > 0 ? `, with ${plural(ofi, 'opportunity for improvement', 'opportunities for improvement')} noted` : ''}.`;
  } else {
    verdict = ` Conformity was demonstrated for the areas sampled; the remaining clause areas were not evaluated in this audit.`;
  }
  const positive =
    conform > 0 ? ` Effective arrangements were observed in the ${plural(conform, 'area', 'areas')} that conformed.` : '';
  const overallConformity = `${lead}${verdict}${positive}`;

  // --- Effectiveness opinion ---
  let emsEffectivenessOpinion: string;
  if (openNc === 0 && input.overdueCapaCount === 0 && majorNc === 0) {
    emsEffectivenessOpinion =
      `On the evidence sampled, the OH&S management system is operating effectively and achieving its intended ` +
      `outcomes of preventing work-related injury and ill health.`;
  } else if (majorNc > 0 || input.overdueCapaCount > 0) {
    emsEffectivenessOpinion =
      `The OH&S management system is not yet demonstrably effective: ${plural(openNc, 'nonconformity remains', 'nonconformities remain')} ` +
      `open and ${plural(input.overdueCapaCount, 'corrective action is', 'corrective actions are')} overdue.`;
  } else {
    emsEffectivenessOpinion =
      `The OH&S management system is largely effective, with ${plural(openNc, 'open nonconformity', 'open nonconformities')} ` +
      `and the improvement opportunities noted to be addressed through the corrective-action process.`;
  }

  // --- Degree to which criteria were met (per-section narrative) ---
  const criteriaMetStatement =
    `Conformity with ISO 45001 was assessed by sampling across clauses 4–10. ` +
    (conformingSections.length
      ? `Conformity was demonstrated in clause ${conformingSections.length === 1 ? 'area' : 'areas'} ${listClauses(conformingSections)}. `
      : '') +
    (ncClauses.length
      ? `Nonconformities were raised against ${ncClauses.length === 1 ? 'clause' : 'clauses'} ${listClauses(ncClauses)}. `
      : `No nonconformities were raised. `) +
    (unanswered > 0
      ? `${plural(unanswered, 'clause area was', 'clause areas were')} not evaluated in this audit.`
      : `All sampled clause areas were evaluated.`);

  return {
    overallConformity,
    emsEffectivenessOpinion,
    criteriaMetStatement,
    recommendation,
    source: 'ruleBased',
    generatedAt: now,
  };
}
