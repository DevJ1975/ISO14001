import { z } from 'zod';

import { tenantRoleSchema } from './roles.js';

/**
 * Platform-admin (superuser) provisioning contracts. A platform superadmin signs
 * in through a dedicated screen and, per client, stands up a tenant + that
 * client's lead auditor + the client's auditee users, each of whom receives a
 * single-use "set your password" link. Schemas live in the domain layer so the
 * API server validates the same shapes the Angular console produces.
 */
export const memberStatusSchema = z.enum(['invited', 'active', 'disabled']);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const tenantPlanSchema = z.enum(['pilot', 'team', 'enterprise']);
export type TenantPlan = z.infer<typeof tenantPlanSchema>;

export const setPasswordPurposeSchema = z.enum(['invite', 'reset']);
export type SetPasswordPurpose = z.infer<typeof setPasswordPurposeSchema>;

export const superadminLoginCommandSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** A user to create alongside the tenant (lead auditor or client/auditee contact). */
export const provisionUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  role: tenantRoleSchema.default('clientViewer'),
});
export type ProvisionUser = z.infer<typeof provisionUserSchema>;

/** One call: create the client tenant + its lead auditor + its client users. */
export const provisionClientCommandSchema = z.object({
  tenantName: z.string().min(1).max(300),
  plan: tenantPlanSchema.default('pilot'),
  leadAuditor: z.object({ email: z.string().email(), displayName: z.string().min(1).max(200) }),
  clientUsers: z.array(provisionUserSchema).max(50).default([]),
  idempotencyKey: z.string().min(12),
});
export type ProvisionClientCommand = z.infer<typeof provisionClientCommandSchema>;

/** Add a single user (auditor or client) to an existing tenant. */
export const addTenantUserCommandSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  role: tenantRoleSchema,
});
export type AddTenantUserCommand = z.infer<typeof addTenantUserCommandSchema>;

export const memberStatusUpdateCommandSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

/** Consume a set-password link and choose a password. */
export const setPasswordCommandSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(200),
});
export type SetPasswordCommand = z.infer<typeof setPasswordCommandSchema>;

/** Safe member projection for the admin/console list (never includes the hash). */
export const adminMemberViewSchema = z.object({
  uid: z.string(),
  tenantId: z.string().nullable(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  status: memberStatusSchema,
  createdAt: z.string().optional(),
});
export type AdminMemberView = z.infer<typeof adminMemberViewSchema>;

export const adminTenantViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: tenantPlanSchema,
  status: z.string(),
  createdAt: z.string().optional(),
  memberCount: z.number().int().optional(),
});
export type AdminTenantView = z.infer<typeof adminTenantViewSchema>;
