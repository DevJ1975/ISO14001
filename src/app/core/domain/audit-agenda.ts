/**
 * Audit agenda + opening/closing meeting-script generation. The rule-based
 * composer turns the audit's own data (auditee, criteria, audit type, checklist
 * and findings) into a tailored audit agenda and into opening- and
 * closing-meeting talking-point scripts that the lead auditor reviews before
 * the meeting. It is deterministic, runs offline, and — like the report draft
 * and the field guide — uses clause identifiers/short titles and the audit's
 * own data only, never verbatim ISO requirement text (copyright guardrail).
 *
 * The same `AuditAgenda` / `MeetingScripts` shapes are what a server-side LLM
 * provider returns, so a real Claude/Vertex generator can be swapped in behind
 * the same boundary (`source: 'ai'`) without changing the client or the audit
 * screen.
 */

export type AgendaResult = 'notStarted' | 'conform' | 'minorNc' | 'majorNc' | 'ofi' | 'na';
export type AgendaFindingType = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';

export interface AuditAgendaInput {
  auditee: string;
  criteria: string;
  /** Human label for the audit type, e.g. "Surveillance". */
  auditTypeLabel: string;
  checklist: { clauseId: string; clauseTitle: string; result: AgendaResult }[];
  findings: { type: AgendaFindingType; clauseId: string; clauseTitle: string; status: string }[];
}

export interface AgendaItinerarySlot {
  /** Top-level clause area, e.g. "4". */
  clause: string;
  /** Short clause-area title (no verbatim requirement text). */
  title: string;
  /** Indicative duration for the slot. */
  duration: string;
  /** What the auditor plans to sample/look at in this slot. */
  focus: string;
}

export interface AuditAgenda {
  title: string;
  scope: string;
  criteria: string;
  objectives: string[];
  itinerary: AgendaItinerarySlot[];
  samplingNotes: string[];
  source: 'ruleBased' | 'ai';
  generatedAt: string;
}

export interface MeetingScript {
  /** Heading for the meeting, e.g. "Opening meeting". */
  heading: string;
  /** Ordered talking points the auditor walks through. */
  talkingPoints: string[];
}

export interface MeetingScripts {
  opening: MeetingScript;
  closing: MeetingScript;
  source: 'ruleBased' | 'ai';
  generatedAt: string;
}

/** The clause areas (top-level ISO 45001 clauses) an audit walks across. */
const CLAUSE_AREAS: ReadonlyArray<readonly [string, string]> = [
  ['4', 'Context of the organization'],
  ['5', 'Leadership and worker participation'],
  ['6', 'Planning'],
  ['7', 'Support'],
  ['8', 'Operation'],
  ['9', 'Performance evaluation'],
  ['10', 'Improvement'],
];

/** Indicative duration per clause area for a one-day sampling plan. */
const AREA_DURATIONS: Record<string, string> = {
  '4': '30 min',
  '5': '45 min',
  '6': '60 min',
  '7': '45 min',
  '8': '90 min',
  '9': '60 min',
  '10': '45 min',
};

function topSection(clauseId: string): string {
  return clauseId.split('.')[0] ?? clauseId;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function listClauses(ids: string[]): string {
  const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return unique.join(', ');
}

interface FindingCounts {
  majorNc: number;
  minorNc: number;
  ofi: number;
  ncClauses: string[];
}

function countFindings(input: AuditAgendaInput): FindingCounts {
  const majorNc = input.findings.filter((f) => f.type === 'majorNc').length;
  const minorNc = input.findings.filter((f) => f.type === 'minorNc').length;
  const ofi = input.findings.filter((f) => f.type === 'ofi').length;
  const ncClauses = input.findings
    .filter((f) => f.type === 'majorNc' || f.type === 'minorNc')
    .map((f) => f.clauseId);
  return { majorNc, minorNc, ofi, ncClauses };
}

/**
 * Compose a tailored audit agenda from the audit data. Pure and deterministic —
 * pass `now` to make the timestamp reproducible in tests.
 */
export function composeAuditAgenda(input: AuditAgendaInput, now: string = new Date().toISOString()): AuditAgenda {
  const total = input.checklist.length;
  const answered = input.checklist.filter((c) => c.result !== 'notStarted').length;
  const { ncClauses } = countFindings(input);

  // Which clause areas carry an existing nonconformity / open line of inquiry.
  const ncSections = new Set(ncClauses.map(topSection));
  // Which clause areas have at least one check on the checklist (so the slot is real).
  const coveredSections = new Set(input.checklist.map((c) => topSection(c.clauseId)));

  const title = `Audit agenda — ${input.auditTypeLabel} audit of ${input.auditee} against ${input.criteria}`;

  const scope =
    `Occupational health & safety management system of ${input.auditee}, sampled across ISO 45001 clauses 4–10. ` +
    `This ${input.auditTypeLabel.toLowerCase()} audit examines conformity with ${input.criteria} on a sampling basis.`;

  const objectives: string[] = [
    `Determine conformity of the OH&S management system with ${input.criteria} across the sampled clause areas.`,
    'Confirm the management system is effectively implemented and maintained to prevent work-related injury and ill health.',
    'Evaluate whether the system is achieving its intended outcomes and identify opportunities for improvement.',
  ];
  if (ncClauses.length) {
    objectives.push(
      `Follow up open lines of inquiry against clause ${ncClauses.length === 1 ? 'area' : 'areas'} ${listClauses(ncClauses)}.`,
    );
  }

  const itinerary: AgendaItinerarySlot[] = CLAUSE_AREAS.filter(
    ([clause]) => coveredSections.has(clause) || ncSections.has(clause),
  ).map(([clause, clauseTitle]) => {
    const focus = ncSections.has(clause)
      ? 'Sample records and interview owners; follow up the open finding(s) in this clause area.'
      : `Sample records, interview owners and observe at the point of work for clause area ${clause}.`;
    return { clause, title: clauseTitle, duration: AREA_DURATIONS[clause] ?? '45 min', focus };
  });

  const samplingNotes: string[] = [
    `Sampling basis: ${plural(answered, 'clause area', 'clause areas')} prepared of ${plural(total, 'on the checklist', 'on the checklist')}; the audit samples representatively rather than examining every record.`,
    'Choose samples across shifts, lines, sites, contractors and risk levels — and record what was sampled so another auditor could repeat it.',
    'Allow time at the opening meeting for the safety induction and at the closing meeting to present and grade findings.',
  ];
  if (ncSections.size) {
    samplingNotes.push(
      `Weight the sample toward clause ${ncSections.size === 1 ? 'area' : 'areas'} ${listClauses([...ncSections])}, where findings are already open.`,
    );
  }

  return {
    title,
    scope,
    criteria: input.criteria,
    objectives,
    itinerary,
    samplingNotes,
    source: 'ruleBased',
    generatedAt: now,
  };
}

/**
 * Compose opening- and closing-meeting talking-point scripts from the audit
 * data. Pure and deterministic — pass `now` to make the timestamp reproducible
 * in tests.
 */
export function composeMeetingScripts(input: AuditAgendaInput, now: string = new Date().toISOString()): MeetingScripts {
  const { majorNc, minorNc, ofi, ncClauses } = countFindings(input);
  const totalFindings = majorNc + minorNc + ofi;

  const opening: MeetingScript = {
    heading: 'Opening meeting',
    talkingPoints: [
      `Welcome and introductions: introduce the audit team and confirm the auditee's attendees and roles for this ${input.auditTypeLabel.toLowerCase()} audit of ${input.auditee}.`,
      'Confirm confidentiality and impartiality: information seen during the audit is treated in confidence and used only to reach audit conclusions.',
      'Safety induction: agree the site safety induction, PPE requirements, permit-to-work and escort arrangements before any walk-through begins.',
      `Confirm scope, criteria and methods: the OH&S management system of ${input.auditee} is assessed against ${input.criteria} across ISO 45001 clauses 4–10, by document review, interviews and observation at the point of work.`,
      'Sampling caveat: the audit works on a representative sampling basis — absence of a finding in an area is not a guarantee of full conformity across that area.',
      'How findings are graded and communicated: findings are recorded as major nonconformity, minor nonconformity or opportunity for improvement, each tied to a clause and to objective evidence, and shared as they arise.',
      'Closing-meeting arrangements: agree when the closing meeting will be held, who needs to attend (including a worker representative where relevant), and how the report will follow.',
    ],
  };

  const findingsSummary =
    totalFindings === 0
      ? 'Findings summary: no nonconformities or opportunities for improvement were raised in the areas sampled.'
      : `Findings summary by grade: ${plural(majorNc, 'major nonconformity', 'major nonconformities')}, ` +
        `${plural(minorNc, 'minor nonconformity', 'minor nonconformities')} and ` +
        `${plural(ofi, 'opportunity for improvement', 'opportunities for improvement')}` +
        (ncClauses.length
          ? `, raised against clause ${ncClauses.length === 1 ? 'area' : 'areas'} ${listClauses(ncClauses)}.`
          : '.');

  const recommendation =
    majorNc > 0
      ? 'Recommendation and next steps: correction and corrective action are needed before conformity can be confirmed; certification/recommendation is subject to addressing the major finding(s).'
      : minorNc > 0
        ? 'Recommendation and next steps: the system broadly meets the criteria; a corrective-action plan for the minor finding(s) is requested and will be reviewed at the next visit.'
        : 'Recommendation and next steps: the system met the audit criteria across the areas sampled; continued maintenance and improvement are encouraged.';

  const closing: MeetingScript = {
    heading: 'Closing meeting',
    talkingPoints: [
      `Thanks and recap: thank the auditee's team and recap the scope and criteria covered against ${input.criteria}.`,
      findingsSummary,
      'Walk through each finding with its clause reference and the objective evidence, and confirm the grade with the auditee.',
      'Agreed correction timelines: major nonconformities typically within ~30 days; minor nonconformities typically within ~90 days, with a corrective-action plan to follow.',
      'Auditee acknowledgement: confirm the auditee understands and acknowledges the findings, and note any diverging opinions for the record.',
      recommendation,
      'Next steps: explain the report, distribution and follow-up arrangements, and how corrective actions will be verified before closure.',
    ],
  };

  return { opening, closing, source: 'ruleBased', generatedAt: now };
}
