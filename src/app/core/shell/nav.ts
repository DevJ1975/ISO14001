/**
 * The primary navigation destinations. Single source of truth shared by the
 * shell (sidebar + bottom tab bar) and the command palette, so they can never
 * drift apart. `keywords` are extra match terms for palette search only.
 */
import type { MessageKey } from '../i18n/locales/en';

export interface NavItem {
  readonly path: string;
  /** English label — also used as the command-palette search/display fallback. */
  readonly label: string;
  /** i18n key resolving to the localized nav label in the shell. */
  readonly labelKey: MessageKey;
  readonly icon: string;
  readonly exact: boolean;
  /** Extra search terms surfaced in the command palette. */
  readonly keywords?: readonly string[];
}

export const NAV_DESTINATIONS: readonly NavItem[] = [
  { path: '/', label: 'Overview', labelKey: 'nav.overview', icon: 'dashboard', exact: true, keywords: ['home', 'dashboard', 'kpi'] },
  { path: '/analytics', label: 'Analytics', labelKey: 'nav.analytics', icon: 'insights', exact: false, keywords: ['portfolio', 'metrics', 'trends', 'kpi'] },
  { path: '/actions', label: 'Actions', labelKey: 'nav.actions', icon: 'notifications', exact: false, keywords: ['alerts', 'attention', 'overdue'] },
  { path: '/audits', label: 'Audits', labelKey: 'nav.audits', icon: 'folder_open', exact: false, keywords: ['select', 'create'] },
  { path: '/audit', label: 'Audit', labelKey: 'nav.audit', icon: 'event', exact: false, keywords: ['meeting', 'opening', 'closing'] },
  { path: '/fieldwork', label: 'Fieldwork', labelKey: 'nav.fieldwork', icon: 'checklist', exact: false, keywords: ['checklist', 'clause', 'questions'] },
  { path: '/evidence', label: 'Evidence', labelKey: 'nav.evidence', icon: 'photo_camera', exact: false, keywords: ['photo', 'note', 'capture'] },
  { path: '/findings', label: 'Findings', labelKey: 'nav.findings', icon: 'flag', exact: false, keywords: ['nonconformity', 'nc', 'capa', 'ofi'] },
  { path: '/registers', label: 'Registers', labelKey: 'nav.registers', icon: 'health_and_safety', exact: false, keywords: ['hazard', 'incident', 'legal', 'risk'] },
  { path: '/people', label: 'People & Sites', labelKey: 'nav.people', icon: 'groups', exact: false, keywords: ['worker', 'site', 'location', 'person'] },
  { path: '/report', label: 'Report', labelKey: 'nav.report', icon: 'description', exact: false, keywords: ['signoff', 'pdf', 'conclusion'] },
  { path: '/programme', label: 'Programme', labelKey: 'nav.programme', icon: 'calendar_month', exact: false, keywords: ['schedule', 'plan', 'calendar'] },
  { path: '/requests', label: 'Requests', labelKey: 'nav.requests', icon: 'cloud_upload', exact: false, keywords: ['evidence', 'upload', 'client'] },
  { path: '/portal', label: 'Client portal', labelKey: 'nav.portal', icon: 'handshake', exact: false, keywords: ['client', 'auditee', 'response', 'portal'] },
  { path: '/retention', label: 'Retention', labelKey: 'nav.retention', icon: 'inventory_2', exact: false, keywords: ['records', 'legal hold', 'disposal', 'governance', 'retain'] },
  { path: '/users', label: 'Users', labelKey: 'nav.users', icon: 'group', exact: false, keywords: ['team', 'roles', 'invite', 'members'] },
];
