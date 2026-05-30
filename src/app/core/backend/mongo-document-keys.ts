export function tenantDocumentKey(tenantId: string): string {
  return `tenants/${tenantId}`;
}

export function tenantMemberDocumentKey(tenantId: string, uid: string): string {
  return `tenants/${tenantId}/members/${uid}`;
}

export function auditeeDocumentKey(tenantId: string, auditeeId: string): string {
  return `tenants/${tenantId}/auditees/${auditeeId}`;
}

export function checklistTemplateDocumentKey(tenantId: string, templateId: string): string {
  return `tenants/${tenantId}/checklistTemplates/${templateId}`;
}

export function auditDocumentKey(tenantId: string, auditId: string): string {
  return `tenants/${tenantId}/audits/${auditId}`;
}

export function auditChecklistItemDocumentKey(tenantId: string, auditId: string, itemId: string): string {
  return `tenants/${tenantId}/audits/${auditId}/checklistItems/${itemId}`;
}

export function auditEvidenceDocumentKey(tenantId: string, auditId: string, evidenceId: string): string {
  return `tenants/${tenantId}/audits/${auditId}/evidence/${evidenceId}`;
}
