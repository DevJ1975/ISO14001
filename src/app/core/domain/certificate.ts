import { z } from 'zod';

import { isoEditionSchema, timestampSchema } from './models.js';

/**
 * Certificate lifecycle for a certification body (ISO/IEC 17021-1 cl. 9.5–9.6):
 * issue, maintain, suspend, restore, reduce scope, withdraw and expire. The
 * certificate itself was not modelled — the workflow stopped at the report and
 * recommendation. Tenant/auditee-scoped (lives on the tenant's audit programme).
 */
export const certificateStatusSchema = z.enum([
  'active',
  'suspended',
  'withdrawn',
  'expired',
  'reducedScope',
]);
export type CertificateStatus = z.infer<typeof certificateStatusSchema>;

export const certificateEventSchema = z.object({
  action: z.enum(['issued', 'suspended', 'restored', 'withdrawn', 'reducedScope', 'expired', 'renewed']),
  at: timestampSchema,
  by: z.string().max(200).optional(),
  reason: z.string().max(1000).optional(),
});
export type CertificateEvent = z.infer<typeof certificateEventSchema>;

export const certificateSchema = z.object({
  id: z.string().min(1),
  certificateNumber: z.string().min(1).max(120),
  auditeeName: z.string().max(300).optional(),
  edition: isoEditionSchema.default('ISO_14001_2026'),
  scopeStatement: z.string().max(2000).default(''),
  sites: z.array(z.string().min(1)).default([]),
  issuedAt: z.union([z.string().date(), z.string().datetime(), z.date()]).optional(),
  expiresAt: z.union([z.string().date(), z.string().datetime(), z.date()]).optional(),
  status: certificateStatusSchema.default('active'),
  history: z.array(certificateEventSchema).default([]),
  updatedAt: timestampSchema,
});
export type Certificate = z.infer<typeof certificateSchema>;

/**
 * Allowed certificate status transitions (ISO/IEC 17021-1): an active
 * certificate can be suspended, have its scope reduced, be withdrawn or expire;
 * a suspended certificate is restored or withdrawn; withdrawn/expired are
 * terminal. Reduced scope behaves like active.
 */
export const CERTIFICATE_TRANSITIONS: Record<CertificateStatus, CertificateStatus[]> = {
  active: ['suspended', 'reducedScope', 'withdrawn', 'expired'],
  reducedScope: ['active', 'suspended', 'withdrawn', 'expired'],
  suspended: ['active', 'withdrawn', 'expired'],
  withdrawn: [],
  expired: [],
};

export function canTransitionCertificate(from: CertificateStatus, to: CertificateStatus): boolean {
  return CERTIFICATE_TRANSITIONS[from]?.includes(to) ?? false;
}

const STATUS_TO_ACTION: Record<CertificateStatus, CertificateEvent['action']> = {
  active: 'restored',
  suspended: 'suspended',
  withdrawn: 'withdrawn',
  expired: 'expired',
  reducedScope: 'reducedScope',
};

/**
 * Apply a status change, appending an immutable history event. Throws on an
 * illegal transition so the lifecycle can't be corrupted.
 */
export function transitionCertificate(
  certificate: Certificate,
  to: CertificateStatus,
  by: string,
  at: string,
  reason?: string,
): Certificate {
  if (!canTransitionCertificate(certificate.status, to)) {
    throw new Error(`Illegal certificate transition: ${certificate.status} → ${to}.`);
  }
  return {
    ...certificate,
    status: to,
    history: [...certificate.history, { action: STATUS_TO_ACTION[to], at, by, reason }],
    updatedAt: at,
  };
}
