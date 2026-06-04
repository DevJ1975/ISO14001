/**
 * Client-context tailoring of the audit checklist & guidance. The rule-based
 * composer turns the auditee's own context (sector, organisation size, key
 * hazards/processes, prior findings) into a TAILORED audit emphasis: which
 * ISO 45001 clause areas to prioritise, suggested focus questions, and
 * risk-based notes — so the auditor's checklist guidance adapts to the specific
 * client instead of being generic. It is deterministic, runs fully offline, and
 * — like the report draft and field guide — uses clause identifiers/short titles
 * and Trainovate-authored content only, never verbatim ISO requirement text
 * (copyright guardrail).
 *
 * The same `ClientTailoring` shape is what a server-side LLM provider returns,
 * so a real Claude/Vertex generator can be swapped in behind the same boundary
 * (`source: 'ai'`) without changing the client or the screen.
 */

export interface ClientTailoringInput {
  /** Auditee/organisation name (used in narrative notes only). */
  auditee: string;
  /** Free-text sector/industry label, e.g. "Construction", "Healthcare". */
  sector: string;
  /** Total worker headcount across the scope (drives size-based emphasis). */
  headcount: number;
  /** Number of operating sites in scope (multi-site sampling emphasis). */
  siteCount: number;
  /** Key hazards/processes in scope — free-text aspect/activity labels. */
  hazards: string[];
  /** Prior findings to carry forward, by clause, for follow-up emphasis. */
  priorFindings: { clauseId: string; clauseTitle: string; type: string }[];
}

/** One prioritised clause area with Trainovate focus prompts and a risk note. */
export interface TailoredArea {
  clauseId: string;
  clauseTitle: string;
  /** Higher = audit earlier / sample more deeply. */
  priority: 'high' | 'medium';
  /** Why this area is emphasised for this client (Trainovate-authored). */
  rationale: string;
  /** Suggested focus questions the auditor can open with (Trainovate-authored). */
  focusPrompts: string[];
}

export interface ClientTailoring {
  /** One-line summary of the tailoring basis (size + sector + hazard count). */
  summary: string;
  /** Prioritised clause areas, high priority first, deterministic order. */
  areas: TailoredArea[];
  /** Cross-cutting risk-based notes for the audit plan. */
  riskNotes: string[];
  source: 'ruleBased' | 'ai';
  generatedAt: string;
}

/** Short Trainovate-authored clause titles (never verbatim ISO requirement text). */
const CLAUSE_TITLES: Record<string, string> = {
  '4': 'Context of the organisation',
  '5': 'Leadership & worker participation',
  '6': 'Planning',
  '7': 'Support',
  '8': 'Operation',
  '9': 'Performance evaluation',
  '10': 'Improvement',
};

function topSection(clauseId: string): string {
  return clauseId.split('.')[0] ?? clauseId;
}

/** Sector keyword → clause groups to emphasise, with a Trainovate rationale. */
const SECTOR_RULES: { match: RegExp; clauses: string[]; note: string }[] = [
  {
    match: /construc|build|civil|infrastructure/i,
    clauses: ['8', '6'],
    note: 'Construction work brings high-energy hazards and frequent change, so operational planning and control of work merit close sampling.',
  },
  {
    match: /health|care|hospital|clinic|nursing/i,
    clauses: ['7', '8'],
    note: 'Healthcare settings carry biological, manual-handling and lone-working exposures, so competence, emergency readiness and operational controls warrant emphasis.',
  },
  {
    match: /manufactur|factory|assembly|production|industrial/i,
    clauses: ['8', '9'],
    note: 'Manufacturing has recurring machinery and exposure hazards, so operational control and performance monitoring of those controls deserve deeper sampling.',
  },
  {
    match: /chemical|oil|gas|petro|process|refin/i,
    clauses: ['8', '6'],
    note: 'Process-industry major-accident potential means hazard identification and operational/emergency controls are priority areas.',
  },
  {
    match: /transport|logistic|warehous|fleet|haul/i,
    clauses: ['8', '7'],
    note: 'Transport and logistics introduce vehicle, load and driver-fatigue risks, so operational controls and driver competence are focus areas.',
  },
  {
    match: /construc|mining|quarry|extract/i,
    clauses: ['6', '8'],
    note: 'Extractive operations carry severe, low-frequency hazards, so risk planning and operational controls warrant close attention.',
  },
];

/** Hazard keyword → clause group to emphasise, with a Trainovate rationale. */
const HAZARD_RULES: { match: RegExp; clause: string; note: string }[] = [
  { match: /height|fall|scaffold|roof|ladder/i, clause: '8', note: 'Work-at-height exposure points to operational controls and permit arrangements.' },
  { match: /chemical|hazardous substance|coshh|solvent|fume|dust/i, clause: '8', note: 'Hazardous-substance exposure points to operational controls and monitoring.' },
  { match: /machin|equipment|guard|press|conveyor/i, clause: '8', note: 'Machinery hazards point to operational controls and maintenance.' },
  { match: /noise|vibration|ergonom|manual handl|lifting/i, clause: '9', note: 'Health exposures point to performance monitoring and surveillance.' },
  { match: /confined|permit|hot work|excavation/i, clause: '8', note: 'Permit-controlled work points to operational controls and emergency readiness.' },
  { match: /electr|arc|shock|isolation/i, clause: '8', note: 'Electrical hazards point to operational controls and isolation procedures.' },
  { match: /contractor|supplier|subcontract|outsourc/i, clause: '8', note: 'Contractor activity points to control of outsourced processes and coordination.' },
  { match: /lone work|isolation|remote/i, clause: '7', note: 'Lone working points to communication and emergency support arrangements.' },
];

/** Trainovate-authored focus prompts per clause group (never verbatim requirement text). */
const CLAUSE_PROMPTS: Record<string, string[]> = {
  '4': [
    'How were interested parties and their OH&S expectations identified for this scope?',
    'How is the boundary of the management system kept current as the organisation changes?',
  ],
  '5': [
    'How do top management demonstrate visible ownership of OH&S outcomes?',
    'How are workers consulted and able to participate in decisions that affect their safety?',
  ],
  '6': [
    'How are hazards identified and risks assessed for the highest-energy activities in scope?',
    'How are OH&S objectives set, resourced and tracked for this site?',
  ],
  '7': [
    'How is competence assured for roles carrying the most significant risk?',
    'How are workers made aware of the controls that protect them day to day?',
  ],
  '8': [
    'How are operational controls applied and verified for the key hazards in scope?',
    'How is emergency preparedness tested for the most credible scenarios here?',
  ],
  '9': [
    'What is monitored to confirm the critical controls are working as intended?',
    'How do internal audit and management review act on the trends that matter most?',
  ],
  '10': [
    'How are incidents and nonconformities investigated to a genuine root cause?',
    'How is improvement demonstrated from the corrective actions taken so far?',
  ],
};

function titleFor(clauseId: string): string {
  return CLAUSE_TITLES[topSection(clauseId)] ?? `Clause ${clauseId}`;
}

/**
 * Compose tailored audit emphasis from the client context. Pure and
 * deterministic — pass `now` to make the timestamp reproducible in tests.
 * Empty-input safe: with no sector/hazards/findings it returns a sensible
 * baseline emphasis on the highest-risk clause areas.
 */
export function composeClientTailoring(
  input: ClientTailoringInput,
  now: string = new Date().toISOString(),
): ClientTailoring {
  const hazards = (input.hazards ?? []).map((h) => (h ?? '').trim()).filter(Boolean);
  const priorFindings = input.priorFindings ?? [];
  const sector = (input.sector ?? '').trim();

  // Accumulate priority scores + rationales per top-level clause section.
  const scores = new Map<string, number>();
  const reasons = new Map<string, string[]>();
  const bump = (clause: string, weight: number, reason: string) => {
    const key = topSection(clause);
    scores.set(key, (scores.get(key) ?? 0) + weight);
    const list = reasons.get(key) ?? [];
    if (!list.includes(reason)) list.push(reason);
    reasons.set(key, list);
  };

  const riskNotes: string[] = [];

  // Baseline: every audit emphasises the operational and planning core.
  bump('6', 1, 'Risk planning is the backbone of any OH&S audit.');
  bump('8', 1, 'Operational control is where day-to-day risk is managed.');

  // Sector emphasis.
  for (const rule of SECTOR_RULES) {
    if (rule.match.test(sector)) {
      rule.clauses.forEach((c, idx) => bump(c, 3 - idx, rule.note));
      riskNotes.push(rule.note);
    }
  }

  // Hazard emphasis.
  for (const hazard of hazards) {
    for (const rule of HAZARD_RULES) {
      if (rule.match.test(hazard)) {
        bump(rule.clause, 2, rule.note);
      }
    }
  }
  if (hazards.length >= 5) {
    bump('6', 1, 'A broad hazard profile makes thorough hazard identification a priority.');
    riskNotes.push(
      `${input.auditee || 'The auditee'} reported ${hazards.length} key hazards/processes, so allow extra time for hazard identification (clause 6) and operational control (clause 8).`,
    );
  }

  // Size emphasis: larger organisations carry consultation and competence load.
  if (input.headcount >= 250) {
    bump('5', 2, 'A large workforce makes worker consultation and participation a priority area.');
    bump('7', 1, 'A large workforce raises the bar for competence and awareness coverage.');
    riskNotes.push(
      `With around ${input.headcount} workers, sample worker consultation (clause 5) and competence (clause 7) across shifts and roles.`,
    );
  } else if (input.headcount > 0 && input.headcount < 50) {
    bump('5', 1, 'In a small organisation, confirm leadership ownership rather than assume formal structures.');
    riskNotes.push(
      `With around ${input.headcount} workers, expect leaner documentation — focus on whether controls work in practice rather than paperwork volume.`,
    );
  }

  // Multi-site emphasis.
  if (input.siteCount > 1) {
    bump('9', 1, 'Multiple sites need monitoring that rolls up consistently to management review.');
    riskNotes.push(
      `${input.siteCount} sites are in scope — apply multi-site sampling and confirm controls are applied consistently across locations.`,
    );
  }

  // Prior findings drive follow-up emphasis (highest weight).
  for (const finding of priorFindings) {
    bump(
      finding.clauseId,
      4,
      `Prior ${finding.type === 'majorNc' ? 'major nonconformity' : finding.type === 'minorNc' ? 'minor nonconformity' : 'finding'} at clause ${finding.clauseId} needs follow-up to confirm effective corrective action.`,
    );
  }
  if (priorFindings.length > 0) {
    const clauses = [...new Set(priorFindings.map((f) => topSection(f.clauseId)))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    riskNotes.push(
      `Carry forward prior findings at ${clauses.length === 1 ? 'clause' : 'clauses'} ${clauses.join(', ')} — verify corrective action effectiveness before sampling elsewhere.`,
    );
  }

  // Rank clause sections by score, then numerically for a stable order.
  const ranked = [...scores.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });

  const topScore = ranked.length ? ranked[0]![1] : 0;
  const areas: TailoredArea[] = ranked.map(([clauseId, score]) => ({
    clauseId,
    clauseTitle: titleFor(clauseId),
    // High priority for the strongest signals (top tier and prior-finding driven).
    priority: score >= Math.max(3, topScore - 1) ? 'high' : 'medium',
    rationale: (reasons.get(clauseId) ?? []).join(' '),
    focusPrompts: CLAUSE_PROMPTS[clauseId] ?? [],
  }));

  const sectorLabel = sector ? sector : 'unspecified sector';
  const sizeLabel =
    input.headcount >= 250 ? 'large' : input.headcount > 0 && input.headcount < 50 ? 'small' : 'mid-sized';
  const summary =
    `Tailored emphasis for ${input.auditee || 'this auditee'} (${sizeLabel} ${sectorLabel}` +
    `${input.siteCount > 1 ? `, ${input.siteCount} sites` : ''}` +
    `${hazards.length ? `, ${hazards.length} key hazards` : ''}` +
    `${priorFindings.length ? `, ${priorFindings.length} prior findings` : ''}).`;

  return {
    summary,
    areas,
    riskNotes,
    source: 'ruleBased',
    generatedAt: now,
  };
}
