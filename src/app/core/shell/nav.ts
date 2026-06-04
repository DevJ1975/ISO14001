/**
 * The primary navigation destinations. Single source of truth shared by the
 * shell (sidebar + bottom tab bar) and the command palette, so they can never
 * drift apart. `keywords` are extra match terms for palette search only.
 */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly exact: boolean;
  /** Extra search terms surfaced in the command palette. */
  readonly keywords?: readonly string[];
}

export const NAV_DESTINATIONS: readonly NavItem[] = [
  { path: '/', label: 'Overview', icon: 'dashboard', exact: true, keywords: ['home', 'dashboard', 'kpi'] },
  { path: '/actions', label: 'Actions', icon: 'notifications', exact: false, keywords: ['alerts', 'attention', 'overdue'] },
  { path: '/audits', label: 'Audits', icon: 'folder_open', exact: false, keywords: ['select', 'create'] },
  { path: '/audit', label: 'Audit', icon: 'event', exact: false, keywords: ['meeting', 'opening', 'closing'] },
  { path: '/fieldwork', label: 'Fieldwork', icon: 'checklist', exact: false, keywords: ['checklist', 'clause', 'questions'] },
  { path: '/evidence', label: 'Evidence', icon: 'photo_camera', exact: false, keywords: ['photo', 'note', 'capture'] },
  { path: '/findings', label: 'Findings', icon: 'flag', exact: false, keywords: ['nonconformity', 'nc', 'capa', 'ofi'] },
  { path: '/registers', label: 'Registers', icon: 'health_and_safety', exact: false, keywords: ['hazard', 'incident', 'legal', 'risk'] },
  { path: '/report', label: 'Report', icon: 'description', exact: false, keywords: ['signoff', 'pdf', 'conclusion'] },
  { path: '/programme', label: 'Programme', icon: 'calendar_month', exact: false, keywords: ['schedule', 'plan', 'calendar'] },
  { path: '/requests', label: 'Requests', icon: 'cloud_upload', exact: false, keywords: ['evidence', 'upload', 'client'] },
  { path: '/portal', label: 'Client portal', icon: 'handshake', exact: false, keywords: ['client', 'auditee', 'response', 'portal'] },
  { path: '/users', label: 'Users', icon: 'group', exact: false, keywords: ['team', 'roles', 'invite', 'members'] },
];
