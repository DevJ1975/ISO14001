/**
 * Portfolio analytics — a cross-audit overview that aggregates metrics ACROSS an
 * auditor's audits, distinct from the single-audit Overview dashboard. The math
 * lives here as a PURE, JSON-serialisable function so it can be unit-tested
 * offline and reproduced deterministically (mirrors the report-draft /
 * working-papers domain-module pattern).
 *
 * It intentionally takes plain arrays of audits, findings, CAPAs and programme
 * data so it generalises to true multi-audit data once a cross-audit list
 * endpoint exists. The first iteration can feed it whatever the client already
 * holds (e.g. the active audit plus the tenant audit list) without any new
 * backend route.
 *
 * Copyright guardrail: ISO clauses are referenced by identifier/short title
 * only — no verbatim requirement text.
 */

/** Findings grading shared with the field store (minor/major NC, OFI, conformity). */
export type PortfolioFindingType = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';

/** Minimal audit shape the aggregator reads (a row from the tenant audit list). */
export interface PortfolioAuditInput {
  id: string;
  /** Lifecycle status, e.g. draft/planned/fieldwork/reporting/followUp/closed/archived. */
  status?: string;
  /** Audit-type label, e.g. internal/surveillance/stage2 — free text, lower-cased for counting. */
  auditType?: string;
}

/** Minimal finding shape — clause + grade + lifecycle status. */
export interface PortfolioFindingInput {
  /** Owning audit id, so findings can be attributed across the portfolio. */
  auditId?: string;
  clauseId: string;
  type: PortfolioFindingType;
  status: string;
  /** Capture timestamp (ISO) — used for the by-month trend. */
  createdAt?: string;
}

/** Minimal corrective-action shape — due date + lifecycle status drive overdue/open/closed. */
export interface PortfolioCapaInput {
  dueDate?: string;
  status: string;
}

/** Minimal internal-audit (cl. 9.2) shape from the programme. */
export interface PortfolioInternalAuditInput {
  status: string;
  plannedDate?: string;
}

/** Minimal planned (certification/surveillance) audit shape from the programme. */
export interface PortfolioPlannedAuditInput {
  status: string;
}

export interface PortfolioAnalyticsInput {
  audits: readonly PortfolioAuditInput[];
  findings: readonly PortfolioFindingInput[];
  capas: readonly PortfolioCapaInput[];
  internalAudits?: readonly PortfolioInternalAuditInput[];
  plannedAudits?: readonly PortfolioPlannedAuditInput[];
  /** Reference "now" for overdue/trend math; injected for deterministic tests. */
  now?: string;
}

/** One labelled count, optionally with a percentage of the row group's max (for bars). */
export interface PortfolioBucket {
  key: string;
  count: number;
}

export interface PortfolioFindingsBreakdown {
  total: number;
  majorNc: number;
  minorNc: number;
  ofi: number;
  conformity: number;
  /** Open vs closed counts over NCs only (OFIs/conformities excluded). */
  openNc: number;
  closedNc: number;
}

export interface PortfolioCapaBreakdown {
  total: number;
  open: number;
  verified: number;
  overdue: number;
}

export interface PortfolioProgrammeHealth {
  plannedTotal: number;
  plannedCompleted: number;
  internalTotal: number;
  internalCompleted: number;
  internalOverdue: number;
}

export interface PortfolioAnalytics {
  generatedAt: string;
  auditCount: number;
  /** Audits grouped by lifecycle status, sorted by count desc then key. */
  auditsByStatus: PortfolioBucket[];
  /** Audits grouped by audit type, sorted by count desc then key. */
  auditsByType: PortfolioBucket[];
  findings: PortfolioFindingsBreakdown;
  capas: PortfolioCapaBreakdown;
  programme: PortfolioProgrammeHealth;
  /** Findings by top-level clause group (4–10 + "other"), in clause order. */
  findingsByClauseGroup: PortfolioBucket[];
  /** Findings by capture month (YYYY-MM), chronological — the simple trend. */
  findingsByMonth: PortfolioBucket[];
}

/** NC lifecycle statuses that count as resolved/closed. */
const CLOSED_NC_STATUSES = new Set(['closed', 'verified', 'rejected']);
/** CAPA statuses that count as completed. */
const VERIFIED_CAPA_STATUSES = new Set(['verified']);
/** Top-level clause groups surfaced in the portfolio trend (ISO 45001 cl. 4–10). */
const CLAUSE_GROUPS = ['4', '5', '6', '7', '8', '9', '10'] as const;

function topClause(clauseId: string): string {
  const head = clauseId.split('.')[0]?.trim() ?? '';
  return (CLAUSE_GROUPS as readonly string[]).includes(head) ? head : 'other';
}

/** Group rows by a key, returning buckets sorted by count desc then key asc (stable, deterministic). */
function bucketsByCount<T>(rows: readonly T[], keyOf: (row: T) => string | undefined): PortfolioBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = (keyOf(row) ?? '').trim() || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function isOverdueCapa(capa: PortfolioCapaInput, nowMs: number): boolean {
  if (VERIFIED_CAPA_STATUSES.has(capa.status)) return false;
  if (capa.status === 'overdue') return true;
  if (!capa.dueDate) return false;
  const due = new Date(capa.dueDate).getTime();
  return !Number.isNaN(due) && due < nowMs;
}

function isOverdueInternalAudit(item: PortfolioInternalAuditInput, nowMs: number): boolean {
  if (item.status === 'completed' || item.status === 'cancelled') return false;
  if (item.status === 'overdue') return true;
  if (!item.plannedDate) return false;
  const planned = new Date(item.plannedDate).getTime();
  return !Number.isNaN(planned) && planned < nowMs;
}

/** Extract a YYYY-MM month key from an ISO timestamp, or null when unparseable. */
function monthKey(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Aggregate portfolio-wide analytics from plain audit / finding / CAPA /
 * programme data. Pure and deterministic: given the same input (and `now`) it
 * returns the same result, with no I/O, store or DOM access. Empty input is
 * safe and yields zeroed buckets.
 */
export function computePortfolioAnalytics(input: PortfolioAnalyticsInput): PortfolioAnalytics {
  const now = input.now ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();

  const findings = input.findings;
  const ncs = findings.filter((f) => f.type === 'majorNc' || f.type === 'minorNc');
  const closedNc = ncs.filter((f) => CLOSED_NC_STATUSES.has(f.status)).length;

  const findingsBreakdown: PortfolioFindingsBreakdown = {
    total: findings.length,
    majorNc: findings.filter((f) => f.type === 'majorNc').length,
    minorNc: findings.filter((f) => f.type === 'minorNc').length,
    ofi: findings.filter((f) => f.type === 'ofi').length,
    conformity: findings.filter((f) => f.type === 'conformity').length,
    openNc: ncs.length - closedNc,
    closedNc,
  };

  const capas = input.capas;
  const capaBreakdown: PortfolioCapaBreakdown = {
    total: capas.length,
    verified: capas.filter((c) => VERIFIED_CAPA_STATUSES.has(c.status)).length,
    overdue: capas.filter((c) => isOverdueCapa(c, nowMs)).length,
    open: capas.filter((c) => !VERIFIED_CAPA_STATUSES.has(c.status) && !isOverdueCapa(c, nowMs)).length,
  };

  const internalAudits = input.internalAudits ?? [];
  const plannedAudits = input.plannedAudits ?? [];
  const programme: PortfolioProgrammeHealth = {
    plannedTotal: plannedAudits.length,
    plannedCompleted: plannedAudits.filter((p) => p.status === 'completed').length,
    internalTotal: internalAudits.length,
    internalCompleted: internalAudits.filter((a) => a.status === 'completed').length,
    internalOverdue: internalAudits.filter((a) => isOverdueInternalAudit(a, nowMs)).length,
  };

  // Findings by clause group — only groups with at least one finding, in clause order.
  const clauseCounts = new Map<string, number>();
  for (const f of findings) {
    const key = topClause(f.clauseId);
    clauseCounts.set(key, (clauseCounts.get(key) ?? 0) + 1);
  }
  const orderedGroups = [...CLAUSE_GROUPS, 'other'];
  const findingsByClauseGroup: PortfolioBucket[] = orderedGroups
    .filter((key) => clauseCounts.has(key))
    .map((key) => ({ key, count: clauseCounts.get(key) ?? 0 }));

  // Findings by capture month — chronological for the trend strip.
  const monthCounts = new Map<string, number>();
  for (const f of findings) {
    const key = monthKey(f.createdAt);
    if (key) monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }
  const findingsByMonth: PortfolioBucket[] = [...monthCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    generatedAt: now,
    auditCount: input.audits.length,
    auditsByStatus: bucketsByCount(input.audits, (a) => a.status?.toLowerCase()),
    auditsByType: bucketsByCount(input.audits, (a) => a.auditType?.toLowerCase()),
    findings: findingsBreakdown,
    capas: capaBreakdown,
    programme,
    findingsByClauseGroup,
    findingsByMonth,
  };
}
