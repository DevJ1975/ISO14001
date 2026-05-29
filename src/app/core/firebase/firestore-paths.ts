export const platformStandardsPath = '/platform/standards';

export function tenantPath(tenantId: string): string {
  return `/tenants/${encodeURIComponent(tenantId)}`;
}

export function memberPath(tenantId: string, uid: string): string {
  return `${tenantPath(tenantId)}/members/${encodeURIComponent(uid)}`;
}

export function auditeePath(tenantId: string, auditeeId: string): string {
  return `${tenantPath(tenantId)}/auditees/${encodeURIComponent(auditeeId)}`;
}

export function checklistTemplatePath(tenantId: string, templateId: string): string {
  return `${tenantPath(tenantId)}/checklistTemplates/${encodeURIComponent(templateId)}`;
}

export function auditPath(tenantId: string, auditId: string): string {
  return `${tenantPath(tenantId)}/audits/${encodeURIComponent(auditId)}`;
}

export function auditChecklistItemPath(tenantId: string, auditId: string, itemId: string): string {
  return `${auditPath(tenantId, auditId)}/checklistItems/${encodeURIComponent(itemId)}`;
}
