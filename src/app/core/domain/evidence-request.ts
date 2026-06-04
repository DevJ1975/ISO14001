import { z } from 'zod';

/**
 * Evidence requests — the auditor-driven "please provide" list that the audited
 * organisation (auditee) fulfils through the client portal (ISO 19011 §6.3
 * evidence collection). The auditor raises a request for a document or record;
 * the auditee uploads what's asked for and the two sides discuss it in a thread
 * attached to the request. Status tracks whose court the ball is in.
 *
 * Schemas live in the domain layer so the API server can validate the same
 * shapes the client produces; the portal/auditor view logic lives alongside in
 * `core/portal/evidence-requests.logic.ts`.
 */
export const evidenceRequestStatusSchema = z.enum(['requested', 'submitted', 'accepted', 'returned']);
export type EvidenceRequestStatus = z.infer<typeof evidenceRequestStatusSchema>;

export const portalMessageAuthorSchema = z.enum(['auditor', 'auditee']);
export type PortalMessageAuthor = z.infer<typeof portalMessageAuthorSchema>;

/** A single message in the request thread — the two-way auditor ⇄ auditee channel. */
export const portalMessageSchema = z.object({
  id: z.string().min(1),
  author: portalMessageAuthorSchema,
  authorName: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  at: z.string().min(1).max(40),
});
export type PortalMessage = z.infer<typeof portalMessageSchema>;

/**
 * An auditee-provided submission against a request. The file metadata is
 * captured here (name/type/size) mirroring the document-attachment model used in
 * the registers; binary transfer reuses the evidence upload pipeline.
 */
export const evidenceSubmissionSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().max(300).optional(),
  mime: z.string().max(200).optional(),
  size: z.number().int().min(0).optional(),
  note: z.string().max(4000).optional(),
  submittedByName: z.string().min(1).max(200),
  submittedAt: z.string().min(1).max(40),
});
export type EvidenceSubmission = z.infer<typeof evidenceSubmissionSchema>;

export const evidenceRequestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  detail: z.string().max(4000).default(''),
  clauseId: z.string().max(40).optional(),
  clauseTitle: z.string().max(300).optional(),
  status: evidenceRequestStatusSchema.default('requested'),
  dueDate: z.string().max(40).optional(),
  createdByName: z.string().min(1).max(200),
  createdAt: z.string().min(1).max(40),
  updatedAt: z.string().max(40).optional(),
  submissions: z.array(evidenceSubmissionSchema).max(100).default([]),
  messages: z.array(portalMessageSchema).max(500).default([]),
});
export type EvidenceRequest = z.infer<typeof evidenceRequestSchema>;
