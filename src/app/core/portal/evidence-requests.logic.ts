/**
 * Pure view logic for evidence requests, shared by the auditee portal and the
 * auditor's request console. Kept free of Angular so the Node test suite can
 * exercise the grouping, ordering and status semantics directly.
 *
 * Status model (whose court the ball is in):
 *   requested  → auditee must upload
 *   returned   → auditor sent it back; auditee must act again (follow-up)
 *   submitted  → auditee has provided evidence; auditor must review
 *   accepted   → auditor is satisfied; closed
 */
import type { EvidenceRequestStatus } from '../domain';

/** Minimal shape the views reason about (a structural subset of EvidenceRequest). */
export interface RequestView {
  status: EvidenceRequestStatus;
  dueDate?: string;
  createdAt: string;
}

/** Statuses where the auditee owes an upload (their action). */
export function isOutstandingForAuditee(req: Pick<RequestView, 'status'>): boolean {
  return req.status === 'requested' || req.status === 'returned';
}

/** Auditee has submitted; the auditor needs to review (their action). */
export function isAwaitingAuditorReview(req: Pick<RequestView, 'status'>): boolean {
  return req.status === 'submitted';
}

/** The auditee may keep submitting until the auditor has accepted the evidence. */
export function canAuditeeSubmit(req: Pick<RequestView, 'status'>): boolean {
  return req.status !== 'accepted';
}

/** Past its due date and not yet accepted. */
export function isOverdue(req: Pick<RequestView, 'status' | 'dueDate'>, now: string | Date = new Date()): boolean {
  if (req.status === 'accepted' || !req.dueDate) return false;
  const due = new Date(req.dueDate).getTime();
  if (Number.isNaN(due)) return false;
  return due < new Date(now).getTime();
}

export function requestStatusLabel(status: EvidenceRequestStatus): string {
  switch (status) {
    case 'requested':
      return 'Requested';
    case 'submitted':
      return 'Submitted — under review';
    case 'accepted':
      return 'Accepted';
    case 'returned':
      return 'Returned for follow-up';
  }
}

export type StatusTone = 'positive' | 'progress' | 'critical' | 'neutral';

export function requestStatusTone(status: EvidenceRequestStatus): StatusTone {
  switch (status) {
    case 'accepted':
      return 'positive';
    case 'submitted':
      return 'progress';
    case 'returned':
      return 'critical';
    case 'requested':
      return 'neutral';
  }
}

export interface EvidenceRequestSummary {
  total: number;
  /** Requested or returned — the auditee still has to upload something. */
  toUpload: number;
  /** Submitted — waiting on the auditor to review. */
  awaitingReview: number;
  accepted: number;
  overdue: number;
}

export function evidenceRequestSummary(
  requests: readonly RequestView[],
  now: string | Date = new Date(),
): EvidenceRequestSummary {
  let toUpload = 0;
  let awaitingReview = 0;
  let accepted = 0;
  let overdue = 0;
  for (const r of requests) {
    if (isOutstandingForAuditee(r)) toUpload++;
    if (isAwaitingAuditorReview(r)) awaitingReview++;
    if (r.status === 'accepted') accepted++;
    if (isOverdue(r, now)) overdue++;
  }
  return { total: requests.length, toUpload, awaitingReview, accepted, overdue };
}

/** Outstanding follow-ups first, then new requests, then under-review, then accepted. */
const STATUS_ORDER: Record<EvidenceRequestStatus, number> = {
  returned: 0,
  requested: 1,
  submitted: 2,
  accepted: 3,
};

/** Sort for display: action-needed first; within a group, earliest due then oldest. */
export function sortRequests<T extends RequestView>(requests: readonly T[]): T[] {
  return requests.slice().sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
