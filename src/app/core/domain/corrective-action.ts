/**
 * Corrective-action (CAPA) assistant. The rule-based composer turns a single
 * finding (nonconformity / OFI) into a likely root-cause analysis and a draft
 * corrective-action plan the auditee and lead auditor review and edit before it
 * is committed (ISO 45001 cl. 10.2). It is deterministic, runs fully offline,
 * and — like the report draft, finding draft and client tailoring — uses clause
 * identifiers / short titles, the finding's own data and ORIGINAL Trainovate
 * content only, never verbatim ISO requirement text (copyright guardrail: no
 * word "shall").
 *
 * The same `CorrectiveActionDraft` shape is what a server-side LLM provider
 * returns, so a real Claude/Vertex generator can be swapped in behind the same
 * boundary (`source: 'ai'`) without changing the client or the findings screen.
 */

export type CorrectiveActionFindingType = 'majorNc' | 'minorNc' | 'ofi' | 'conformity' | string;
export type CorrectiveActionSeverity = 'low' | 'medium' | 'high';

export interface CorrectiveActionInput {
  clauseId: string;
  clauseTitle: string;
  /** The finding's grade (drives containment urgency and plan depth). */
  type: CorrectiveActionFindingType;
  /** Short finding title / heading. */
  title?: string;
  /** The nonconformity statement / description the finding rests on. */
  description?: string;
  /** Whether the finding was graded systemic (multiple instances / one requirement). */
  systemic?: boolean;
  /** Optional related register context — e.g. incidents, hazards or prior CAPAs touching this clause. */
  relatedContext?: { label: string; detail?: string }[];
}

/** One proposed corrective-action step with an optional owner and a rationale. */
export interface CorrectiveActionStep {
  /** What to do (Trainovate-authored, in our own words). */
  action: string;
  /** Suggested owner role (left for the auditee to confirm). */
  owner?: string;
  /** Why this step addresses the cause (Trainovate-authored). */
  why: string;
}

export interface CorrectiveActionDraft {
  /** Likely root-cause hypotheses to test (not conclusions) — deterministic order. */
  rootCauseHypotheses: string[];
  /** Draft corrective-action plan steps, ordered correction → corrective → preventive. */
  correctiveActions: CorrectiveActionStep[];
  /** Immediate containment / correction to make it safe now (omitted for OFIs). */
  containment?: string;
  /** One-line summary of the basis for the suggestion. */
  summary: string;
  source: 'ruleBased' | 'ai';
  generatedAt: string;
}

function topSection(clauseId: string): string {
  return clauseId.split('.')[0] ?? clauseId;
}

/** Suggested owner role per top-level clause area (Trainovate-authored). */
const CLAUSE_OWNER: Record<string, string> = {
  '4': 'Management representative',
  '5': 'Top management',
  '6': 'OH&S risk owner',
  '7': 'Competence / training lead',
  '8': 'Operations / line manager',
  '9': 'Monitoring & measurement lead',
  '10': 'Management representative',
};

/** Clause-area-specific root-cause angles to test (Trainovate-authored, never verbatim ISO text). */
const CLAUSE_ROOT_CAUSE: Record<string, string> = {
  '4': 'an interested-party need or a system boundary was not kept current as the organisation changed',
  '5': 'leadership ownership or worker participation was not visible enough to drive the arrangement',
  '6': 'the hazard or risk was not fully identified, or the planned control was not proportionate to it',
  '7': 'competence, awareness or resourcing for the role carrying the risk fell short',
  '8': 'the operational control was defined but not consistently applied, or was not defined at all',
  '9': 'monitoring did not surface the gap early enough for action to be taken',
  '10': 'a previous corrective action did not reach the true cause, so the issue recurred',
};

const TYPE_LABEL: Record<string, string> = {
  majorNc: 'major nonconformity',
  minorNc: 'minor nonconformity',
  ofi: 'opportunity for improvement',
  conformity: 'conforming finding',
};

function typeLabel(type: CorrectiveActionFindingType): string {
  return TYPE_LABEL[type] ?? 'finding';
}

function ownerFor(clauseId: string): string {
  return CLAUSE_OWNER[topSection(clauseId)] ?? 'Process owner';
}

/**
 * Compose a likely root-cause analysis and a draft corrective-action plan from
 * a single finding. Pure and deterministic — pass `now` to make the timestamp
 * reproducible in tests. Empty-input safe: with only a clause id it still
 * returns a sensible baseline root-cause and plan.
 */
export function composeCorrectiveAction(
  input: CorrectiveActionInput,
  now: string = new Date().toISOString(),
): CorrectiveActionDraft {
  const clauseId = (input.clauseId ?? '').trim();
  const clauseTitle = (input.clauseTitle ?? '').trim();
  const clauseRef = clauseTitle ? `clause ${clauseId} — ${clauseTitle}` : `clause ${clauseId || '(unspecified)'}`;
  const section = topSection(clauseId);
  const isOfi = input.type === 'ofi';
  const isMajor = input.type === 'majorNc';
  const systemic = input.systemic === true;
  const description = (input.description ?? '').trim();
  const title = (input.title ?? '').trim();
  const context = (input.relatedContext ?? [])
    .map((entry) => ({ label: (entry?.label ?? '').trim(), detail: (entry?.detail ?? '').trim() }))
    .filter((entry) => entry.label.length > 0);

  // --- Root-cause hypotheses (questions / angles to test, not conclusions) ---
  const rootCauseHypotheses: string[] = [];
  const clauseAngle = CLAUSE_ROOT_CAUSE[section];
  if (clauseAngle) {
    rootCauseHypotheses.push(`Test whether, at ${clauseRef}, ${clauseAngle}.`);
  } else {
    rootCauseHypotheses.push(`Test how far back the cause of the gap at ${clauseRef} reaches.`);
  }
  rootCauseHypotheses.push(
    'Consider whether the arrangement was defined but not followed, or not defined in the first place.',
  );
  if (systemic) {
    rootCauseHypotheses.push(
      'Because this was graded systemic, look for a common cause across the instances rather than treating each one in isolation.',
    );
  }
  if (description) {
    rootCauseHypotheses.push(
      `Trace the specific gap described ("${description}") back to the decision, resource or control that allowed it.`,
    );
  }
  if (context.length) {
    rootCauseHypotheses.push(
      `Review related records (${context.map((entry) => entry.label).join('; ')}) for a shared underlying cause.`,
    );
  }
  rootCauseHypotheses.push('Check whether the same cause could affect other areas, shifts, sites or clauses.');

  // --- Draft corrective-action plan (correction → corrective → preventive) ---
  const owner = ownerFor(clauseId);
  const correctiveActions: CorrectiveActionStep[] = [];

  // Immediate containment / correction (not for OFIs, which are advisory).
  let containment: string | undefined;
  if (!isOfi) {
    containment = isMajor
      ? `Make the situation safe now: apply an interim control at ${clauseRef} so the risk is contained while the root cause is investigated.`
      : `Apply an immediate correction at ${clauseRef} to address the specific instance found while the cause is investigated.`;
    correctiveActions.push({
      action: `Record the correction taken to contain the issue at ${clauseRef}.`,
      owner,
      why: 'Correction makes the situation safe now; it is recorded separately from the action that stops recurrence.',
    });
  }

  // Root-cause investigation step.
  correctiveActions.push({
    action: isOfi
      ? `Confirm the improvement opportunity at ${clauseRef} is worth pursuing and identify what currently limits it.`
      : `Investigate the root cause of the gap at ${clauseRef} using a structured method (e.g. 5 Whys), testing the hypotheses above.`,
    owner,
    why: isOfi
      ? 'An OFI is advisory; understanding the constraint keeps any change proportionate.'
      : 'A corrective action can only eliminate a cause that has actually been found, not just the symptom.',
  });

  // Corrective action to eliminate the cause.
  correctiveActions.push({
    action: isOfi
      ? `Plan a proportionate improvement to strengthen arrangements at ${clauseRef}, with an owner and a target date.`
      : `Define a corrective action that eliminates the confirmed cause at ${clauseRef}, with an owner and a target date.`,
    owner,
    why: isOfi
      ? 'Improvements still benefit from an owner and date so the benefit is realised and tracked.'
      : 'The corrective action targets the cause so the same nonconformity does not recur.',
  });

  // Systemic / preventive extension.
  if (systemic || isMajor) {
    correctiveActions.push({
      action: `Check whether the same cause affects other areas, shifts or sites and extend the action where it does.`,
      owner,
      why: 'A systemic or major issue is rarely isolated; extending the action prevents recurrence elsewhere.',
    });
  }

  // Effectiveness verification (auditor-review gate).
  correctiveActions.push({
    action: `Plan how effectiveness will be verified at ${clauseRef} (what evidence will show the cause is gone).`,
    owner: 'Lead auditor',
    why: 'The corrective-action loop is only closed once verification confirms the action worked.',
  });

  // --- Summary ---
  const subject = title || (description ? description.slice(0, 60) : `the ${typeLabel(input.type)}`);
  const summary =
    `Draft root-cause analysis and corrective-action plan for ${subject} at ${clauseRef}` +
    `${systemic ? ' (graded systemic)' : ''}` +
    `${context.length ? `, drawing on ${context.length} related ${context.length === 1 ? 'record' : 'records'}` : ''}. ` +
    `Review and adapt before committing — these are prompts, not conclusions.`;

  return {
    rootCauseHypotheses,
    correctiveActions,
    containment,
    summary,
    source: 'ruleBased',
    generatedAt: now,
  };
}
