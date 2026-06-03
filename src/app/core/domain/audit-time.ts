/**
 * Audit-duration (man-day) estimator for certification audits, following the
 * methodology of IAF MD 5 (Determination of Audit Time): a base time derived
 * from the *effective* number of personnel, adjusted by management-system
 * complexity and documented additions/reductions (IMS integration, maturity,
 * shift work, off-site working…). The base figures here are representative and
 * configurable — a certification body sets its own audit-time procedure. This
 * module references IAF MD 5 by number/title only and contains no quoted text.
 */

export type AuditComplexity = 'high' | 'medium' | 'low' | 'limited';

export type CertificationStage = 'initial' | 'surveillance' | 'recertification';

export interface AuditTimeInput {
  /** Effective number of personnel (FTEs doing work covered by the OHSMS). */
  effectivePersonnel: number;
  complexity?: AuditComplexity;
  /** Documented reduction, as a percentage (0–30 per IAF MD 5). */
  reductionPercent?: number;
  /** Documented addition, as a percentage. */
  additionPercent?: number;
  stage?: CertificationStage;
}

export interface AuditTimeAdjustment {
  label: string;
  deltaDays: number;
}

export interface AuditTimeResult {
  /** Base initial-audit (stage 1 + 2) days from the table. */
  baseDays: number;
  /** Recommended on-site audit days after complexity, stage and adjustments. */
  recommendedDays: number;
  adjustments: AuditTimeAdjustment[];
}

/**
 * Representative IAF MD 5 initial-certification base audit days by effective
 * personnel (upper bound of each band → days). Configurable per CB procedure.
 */
const BASE_TABLE: ReadonlyArray<readonly [maxPersonnel: number, days: number]> = [
  [5, 1.5],
  [10, 2],
  [15, 2.5],
  [25, 3],
  [45, 4],
  [65, 5],
  [85, 6],
  [125, 7],
  [175, 8],
  [275, 9],
  [425, 10],
  [625, 11],
  [875, 12],
  [1175, 13],
  [1550, 14],
  [2025, 15],
  [2675, 16],
  [3450, 17],
  [4350, 18],
  [5450, 19],
  [6800, 20],
];

const COMPLEXITY_FACTOR: Record<AuditComplexity, number> = {
  high: 1,
  medium: 0.85,
  low: 0.7,
  limited: 0.6,
};

/** Surveillance ≈ 1/3 and recertification ≈ 2/3 of initial audit time (IAF MD 5). */
const STAGE_FACTOR: Record<CertificationStage, number> = {
  initial: 1,
  surveillance: 1 / 3,
  recertification: 2 / 3,
};

/** Base initial-audit days for an effective head-count, from the table. */
export function baseAuditDays(effectivePersonnel: number): number {
  const personnel = Math.max(1, Math.floor(effectivePersonnel));
  for (const [maxPersonnel, days] of BASE_TABLE) {
    if (personnel <= maxPersonnel) return days;
  }
  return BASE_TABLE[BASE_TABLE.length - 1][1];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Estimate recommended audit days. Reductions are capped at 30% (IAF MD 5);
 * the result is floored at 0.5 day. Returns the base, the recommendation and an
 * itemised breakdown of each adjustment so the calculation is defensible.
 */
export function calculateAuditDuration(input: AuditTimeInput): AuditTimeResult {
  const baseDays = baseAuditDays(input.effectivePersonnel);
  const adjustments: AuditTimeAdjustment[] = [];

  const complexity = input.complexity ?? 'high';
  const complexityFactor = COMPLEXITY_FACTOR[complexity];
  let days = baseDays * complexityFactor;
  if (complexityFactor !== 1) {
    adjustments.push({ label: `Complexity: ${complexity}`, deltaDays: round(days - baseDays) });
  }

  const stage = input.stage ?? 'initial';
  if (stage !== 'initial') {
    const before = days;
    days *= STAGE_FACTOR[stage];
    adjustments.push({ label: `Stage: ${stage}`, deltaDays: round(days - before) });
  }

  const reduction = Math.min(30, Math.max(0, input.reductionPercent ?? 0));
  if (reduction > 0) {
    const before = days;
    days *= 1 - reduction / 100;
    adjustments.push({ label: `Reduction ${reduction}%`, deltaDays: round(days - before) });
  }

  const addition = Math.max(0, input.additionPercent ?? 0);
  if (addition > 0) {
    const before = days;
    days *= 1 + addition / 100;
    adjustments.push({ label: `Addition ${addition}%`, deltaDays: round(days - before) });
  }

  return { baseDays, recommendedDays: Math.max(0.5, round(days)), adjustments };
}
