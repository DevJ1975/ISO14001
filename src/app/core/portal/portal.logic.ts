/**
 * Auditee portal logic (ISO 19011 reporting / cl. 10.2 close-out). The auditee —
 * the organisation being audited — gets a scoped, read-mostly view of the
 * findings raised against them, so they can acknowledge each one and record their
 * proposed correction, without access to the auditor's full workspace.
 *
 * Kept pure so the Node suite can exercise the scoping and state transitions
 * directly. Authorisation is enforced by role + tenant elsewhere; this module
 * decides *what* an auditee may see and *which* response transitions are valid.
 */
export type NcGrade = 'minorNc' | 'majorNc' | 'ofi' | 'conformity';
export type NcStatus = 'open' | 'responded' | 'implemented' | 'verified' | 'closed' | 'rejected' | 'reopened';

export interface PortalFinding {
  id: string;
  clauseId: string;
  clauseTitle: string;
  type: NcGrade;
  description: string;
  requirementSummary?: string;
  status: NcStatus;
  createdAt: string;
  /** Auditee-supplied acknowledgement + proposed correction (the portal's write surface). */
  acknowledgedAt?: string;
  responseText?: string;
}

/** Grades the auditee is asked to act on (nonconformities). OFIs are advisory; conformities are informational. */
const ACTIONABLE: ReadonlySet<NcGrade> = new Set<NcGrade>(['minorNc', 'majorNc']);

/** Roles allowed into the auditee portal. */
export function isAuditeeRole(role: string | undefined): boolean {
  return role === 'clientViewer';
}

/**
 * The auditee-visible projection of a finding: only fields appropriate to share
 * (no internal grading rationale, no auditor identities, no raw evidence refs).
 */
export function toPortalFinding(finding: {
  id: string;
  clauseId: string;
  clauseTitle: string;
  type: NcGrade;
  description: string;
  requirementSummary?: string;
  status: NcStatus;
  createdAt: string;
  acknowledgedAt?: string;
  responseText?: string;
}): PortalFinding {
  return {
    id: finding.id,
    clauseId: finding.clauseId,
    clauseTitle: finding.clauseTitle,
    type: finding.type,
    description: finding.description,
    requirementSummary: finding.requirementSummary,
    status: finding.status,
    createdAt: finding.createdAt,
    acknowledgedAt: finding.acknowledgedAt,
    responseText: finding.responseText,
  };
}

/** Findings the portal should surface: nonconformities and OFIs, newest first; conformities are hidden. */
export function visibleFindings(findings: readonly PortalFinding[]): PortalFinding[] {
  return findings
    .filter((f) => f.type !== 'conformity')
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Whether the auditee may still respond to a finding (open/reopened actionable NCs not yet closed). */
export function canRespond(finding: Pick<PortalFinding, 'type' | 'status'>): boolean {
  if (!ACTIONABLE.has(finding.type)) return false;
  return finding.status === 'open' || finding.status === 'reopened' || finding.status === 'responded';
}

export interface PortalSummary {
  total: number;
  major: number;
  minor: number;
  ofi: number;
  awaitingResponse: number;
  acknowledged: number;
}

/** Headline counts for the portal landing (what's outstanding for the auditee). */
export function portalSummary(findings: readonly PortalFinding[]): PortalSummary {
  const visible = visibleFindings(findings);
  let major = 0;
  let minor = 0;
  let ofi = 0;
  let awaiting = 0;
  let acknowledged = 0;
  for (const f of visible) {
    if (f.type === 'majorNc') major++;
    else if (f.type === 'minorNc') minor++;
    else if (f.type === 'ofi') ofi++;
    if (f.acknowledgedAt) acknowledged++;
    else if (canRespond(f)) awaiting++;
  }
  return { total: visible.length, major, minor, ofi, awaitingResponse: awaiting, acknowledged };
}
