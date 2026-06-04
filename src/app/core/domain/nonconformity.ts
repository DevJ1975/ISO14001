import { z } from 'zod';

import { clauseRefSchema, findingTypeSchema, timestampSchema } from './models.js';

/** Nonconformity lifecycle: raised -> auditee responds -> implements -> auditor verifies effectiveness -> closed. */
export const ncStatusSchema = z.enum([
  'open',
  'responded',
  'implemented',
  'verified',
  'closed',
  'rejected',
  'reopened',
]);
export type NcStatus = z.infer<typeof ncStatusSchema>;

export const nonconformitySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  clauseRef: clauseRefSchema,
  requirementSummary: z.string().min(1).max(500),
  statement: z.string().min(1).max(2000),
  objectiveEvidence: z.string().min(1).max(2000),
  evidenceIds: z.array(z.string().min(1)).default([]),
  grade: findingTypeSchema,
  gradingRationale: z.string().max(2000).optional(),
  systemic: z.boolean().default(false),
  status: ncStatusSchema.default('open'),
  createdBy: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Nonconformity = z.infer<typeof nonconformitySchema>;

/** Typical corrective-action timelines (days) by grade for certification audits. */
export const capaTimelineDays = { majorNc: 30, minorNc: 90 } as const;

/**
 * ISO 45001 cl. 10.2 distinguishes the *intent* of an action: an immediate
 * correction (containment), a root-cause-driven corrective action, or a
 * proactive preventive action raised before a nonconformity occurs.
 */
export const capaIntentSchema = z.enum(['correction', 'correctiveAction', 'preventiveAction']);
export type CapaIntent = z.infer<typeof capaIntentSchema>;

/**
 * Recognised root-cause analysis methods offered on a CAPA. Named distinctly
 * from the incident-investigation `rootCauseMethodSchema` (cl. 8.2) so both can
 * coexist with their own option sets.
 */
export const capaRootCauseMethodSchema = z.enum(['fiveWhys', 'fishbone', 'faultTree', 'other']);
export type CapaRootCauseMethod = z.infer<typeof capaRootCauseMethodSchema>;

/** Default CAPA intent when a record is first started. */
export const DEFAULT_CAPA_INTENT: CapaIntent = 'correctiveAction';

const CAPA_INTENT_LABELS: Record<CapaIntent, string> = {
  correction: 'Correction',
  correctiveAction: 'Corrective action',
  preventiveAction: 'Preventive action',
};

const CAPA_ROOT_CAUSE_METHOD_LABELS: Record<CapaRootCauseMethod, string> = {
  fiveWhys: '5 Whys',
  fishbone: 'Fishbone (Ishikawa)',
  faultTree: 'Fault tree analysis',
  other: 'Other',
};

/** Human-readable label for a CAPA intent (falls back to the default). */
export function capaIntentLabel(intent: CapaIntent | undefined): string {
  return CAPA_INTENT_LABELS[intent ?? DEFAULT_CAPA_INTENT];
}

/** Human-readable label for a CAPA root-cause method (empty when unset). */
export function capaRootCauseMethodLabel(method: CapaRootCauseMethod | undefined): string {
  return method ? CAPA_ROOT_CAUSE_METHOD_LABELS[method] : '';
}

export interface ClassificationInput {
  /** Absence or total breakdown of a required OHSMS process. */
  isAbsentOrTotalBreakdown?: boolean;
  /** Significant doubt the OHSMS can achieve its intended results / product or service conformance. */
  castsDoubtOnOutcomes?: boolean;
  /** Significant legal-compliance or environmental risk. */
  legalOrSignificantEnvRisk?: boolean;
  /** Number of nonconformities already raised against the same requirement (>= 2 => systemic). */
  minorCountAgainstRequirement?: number;
  /** Improvement suggestion only — not a non-fulfilment of a requirement. */
  isImprovementOnly?: boolean;
  /** A single, isolated lapse. */
  isIsolatedLapse?: boolean;
}

export interface ClassificationResult {
  grade: z.infer<typeof findingTypeSchema>;
  systemic: boolean;
  timelineDays?: number;
  rationale: string;
}

/**
 * Encodes the ISO/IEC 17021-1 major-vs-minor criteria: a major nonconformity
 * affects the OHSMS's capability to achieve intended results (absence/total
 * breakdown of a required process, significant doubt about control/conformance,
 * legal/environmental risk, or several minors against one requirement = systemic);
 * a minor is an isolated lapse; an OFI is an improvement suggestion, not an NC.
 */
export function classifyFinding(input: ClassificationInput): ClassificationResult {
  if (input.isImprovementOnly) {
    return {
      grade: 'ofi',
      systemic: false,
      rationale: 'Opportunity for improvement; not a non-fulfilment of a requirement.',
    };
  }

  const systemicByCount = (input.minorCountAgainstRequirement ?? 0) >= 2;
  const reasons: string[] = [];
  if (input.isAbsentOrTotalBreakdown) reasons.push('absence or total breakdown of a required OHSMS process');
  if (input.castsDoubtOnOutcomes) reasons.push('significant doubt the OHSMS achieves its intended results');
  if (input.legalOrSignificantEnvRisk) reasons.push('significant compliance or environmental risk');
  if (systemicByCount) reasons.push('multiple nonconformities against one requirement (systemic)');

  if (reasons.length > 0) {
    return {
      grade: 'majorNc',
      systemic: true,
      timelineDays: capaTimelineDays.majorNc,
      rationale: `Major: affects the capability of the OHSMS to achieve intended results — ${reasons.join('; ')}.`,
    };
  }

  return {
    grade: 'minorNc',
    systemic: false,
    timelineDays: capaTimelineDays.minorNc,
    rationale: 'Minor: an isolated lapse that does not affect the capability of the OHSMS to achieve intended results.',
  };
}
