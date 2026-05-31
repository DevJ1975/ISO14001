import { z } from 'zod';

import { checklistItemResultSchema } from './checklists.js';
import { complianceStatusSchema } from './ems-registers.js';
import { timestampSchema } from './models.js';

/**
 * Environmental permits, licences and consents (ISO 14001 cl. 6.1.3 / 9.1.2).
 * Compliance obligations capture the requirement; this register tracks the
 * permit instruments themselves — their conditions, monitoring requirements and,
 * crucially, renewal/expiry — so an auditor can see what is current, what is
 * lapsing and what has expired.
 */
export const permitTypeSchema = z.enum(['permit', 'licence', 'consent', 'registration', 'exemption']);
export type PermitType = z.infer<typeof permitTypeSchema>;

/** Permit dates are naturally calendar dates (from a date picker), but a full
 *  datetime is also accepted so server-stamped values validate too. */
const permitDateSchema = z.union([z.string().date(), z.string().datetime(), z.date()]);

export const permitSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  title: z.string().min(1).max(300),
  permitType: permitTypeSchema.default('permit'),
  reference: z.string().max(200).optional(),
  issuingAuthority: z.string().max(300).optional(),
  issuedAt: permitDateSchema.optional(),
  expiresAt: permitDateSchema.optional(),
  renewalReminderDays: z.number().int().min(0).max(3650).default(90),
  conditionsSummary: z.string().max(2000).optional(),
  monitoringRequirements: z.string().max(2000).optional(),
  complianceStatus: complianceStatusSchema.default('toVerify'),
  result: checklistItemResultSchema.default('notStarted'),
  evidenceIds: z.array(z.string().min(1)).default([]),
  updatedAt: timestampSchema,
});
export type Permit = z.infer<typeof permitSchema>;

export type PermitExpiryStatus = 'valid' | 'expiringSoon' | 'expired' | 'noDate';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Classify a permit by its renewal window: expired (past `expiresAt`), expiring
 * soon (within `renewalReminderDays`, default 90), valid, or noDate when no
 * expiry is recorded.
 */
export function permitExpiryStatus(
  permit: { expiresAt?: string | Date; renewalReminderDays?: number },
  now: string | Date = new Date(),
): PermitExpiryStatus {
  if (!permit.expiresAt) return 'noDate';
  const expires = new Date(permit.expiresAt).getTime();
  const today = new Date(now).getTime();
  if (Number.isNaN(expires)) return 'noDate';
  const daysUntil = Math.floor((expires - today) / DAY_MS);
  if (daysUntil < 0) return 'expired';
  const window = permit.renewalReminderDays ?? 90;
  return daysUntil <= window ? 'expiringSoon' : 'valid';
}

/** Days until expiry (negative if already expired); null when no date is set. */
export function permitDaysUntilExpiry(
  permit: { expiresAt?: string | Date },
  now: string | Date = new Date(),
): number | null {
  if (!permit.expiresAt) return null;
  const expires = new Date(permit.expiresAt).getTime();
  if (Number.isNaN(expires)) return null;
  return Math.floor((expires - new Date(now).getTime()) / DAY_MS);
}
