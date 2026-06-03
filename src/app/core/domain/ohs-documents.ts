/**
 * Document-control helpers for documented information (ISO 45001 cl. 7.5).
 * The base register records the document and its control status; auditors and
 * competitor EHS/QMS platforms also expect version control, ownership, and a
 * periodic-review cycle — an overdue document review is a common finding.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Metadata for a file attached to a controlled document (the blob itself is stored locally). */
export interface DocumentAttachment {
  id: string;
  name: string;
  mime?: string;
  size?: number;
  /** IndexedDB blob key for the locally held file (mirrors the photo-evidence model). */
  blobKey?: string;
  /** True once the blob has been uploaded to shared storage (live mode). */
  uploaded?: boolean;
  addedAt: string;
}

export type DocumentReviewStatus = 'current' | 'dueSoon' | 'overdue' | 'noDate';

/**
 * Document review status from the next-review date: overdue (past), dueSoon
 * (within `withinDays`, default 30), current, or noDate.
 */
export function documentReviewStatus(
  record: { nextReviewAt?: string | Date },
  now: string | Date = new Date(),
  withinDays = 30,
): DocumentReviewStatus {
  if (!record.nextReviewAt) return 'noDate';
  const due = new Date(record.nextReviewAt).getTime();
  if (Number.isNaN(due)) return 'noDate';
  const days = Math.floor((due - new Date(now).getTime()) / DAY_MS);
  if (days < 0) return 'overdue';
  return days <= withinDays ? 'dueSoon' : 'current';
}
