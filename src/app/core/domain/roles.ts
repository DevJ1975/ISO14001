import { z } from 'zod';

export const roleSchema = z.enum([
  'platformSuperadmin',
  'tenantAdmin',
  'leadAuditor',
  'auditor',
  'clientViewer',
]);

export type Role = z.infer<typeof roleSchema>;

export const tenantRoleSchema = roleSchema.exclude(['platformSuperadmin']);
export type TenantRole = z.infer<typeof tenantRoleSchema>;

export const customClaimsSchema = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal(true),
    role: z.literal('platformSuperadmin'),
    tenantId: z.never().optional(),
  }),
  z.object({
    platform: z.literal(false).default(false),
    role: tenantRoleSchema,
    tenantId: z.string().min(1),
  }),
]);

export type CustomClaims = z.infer<typeof customClaimsSchema>;

export const permissionSchema = z.enum([
  'tenant.read',
  'tenant.manage',
  'members.manage',
  'auditees.manage',
  'templates.manage',
  'audits.create',
  'audits.assign',
  'audits.readAssigned',
  'audits.captureEvidence',
  'audits.manageFindings',
  'reports.sign',
  'capa.manage',
  'client.readOwnAuditee',
]);

export type Permission = z.infer<typeof permissionSchema>;

export const rolePermissions: Record<TenantRole, Permission[]> = {
  tenantAdmin: [
    'tenant.read',
    'tenant.manage',
    'members.manage',
    'auditees.manage',
    'templates.manage',
    'audits.create',
    'audits.assign',
    'capa.manage',
  ],
  leadAuditor: [
    'tenant.read',
    'auditees.manage',
    'audits.create',
    'audits.assign',
    'audits.readAssigned',
    'audits.captureEvidence',
    'audits.manageFindings',
    'reports.sign',
    'capa.manage',
  ],
  auditor: [
    'tenant.read',
    'audits.readAssigned',
    'audits.captureEvidence',
    'audits.manageFindings',
  ],
  clientViewer: ['client.readOwnAuditee'],
};

export function hasPermission(role: TenantRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
