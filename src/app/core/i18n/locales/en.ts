/**
 * English message catalog — the source-of-truth default locale.
 *
 * Keys are organised by area (nav.*, common.*, shell.*, login.*, registers.*).
 * `MessageKey` is derived from this object so other locales (and the `t()`
 * lookups) are type-checked against it. Values may contain `{name}`-style
 * placeholders resolved by the i18n service.
 *
 * To add a translatable string: add the key here first (English is always the
 * fallback), then mirror it in the other locale files.
 */
export const en = {
  // Generic action / status words reused across screens.
  'common.save': 'Save',
  'common.add': 'Add',
  'common.remove': 'Remove',
  'common.cancel': 'Cancel',
  'common.export': 'Export',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.settings': 'Settings',
  'common.language': 'Language',
  'common.jurisdiction': 'Jurisdiction',

  // App shell: navigation labels, connection/source badges, header controls.
  'nav.overview': 'Overview',
  'nav.analytics': 'Analytics',
  'nav.actions': 'Actions',
  'nav.audits': 'Audits',
  'nav.audit': 'Audit',
  'nav.fieldwork': 'Fieldwork',
  'nav.evidence': 'Evidence',
  'nav.findings': 'Findings',
  'nav.registers': 'Registers',
  'nav.people': 'People & Sites',
  'nav.report': 'Report',
  'nav.programme': 'Programme',
  'nav.requests': 'Requests',
  'nav.portal': 'Client portal',
  'nav.retention': 'Retention',
  'nav.users': 'Users',

  'shell.source.live': 'Live',
  'shell.source.local': 'Local',
  'shell.source.offline': 'Offline',
  'shell.source.hint.live': 'Connected to the live backend',
  'shell.source.hint.offline': 'Offline — changes are queued on this device',
  'shell.source.hint.local': 'Local store — backend not connected',
  'shell.online': 'Online',
  'shell.offline': 'Offline',
  'shell.syncNow': 'Sync now',
  'shell.search': 'Search sections',
  'shell.tour': 'Take a guided tour',
  'shell.theme.toLight': 'Switch to light mode',
  'shell.theme.toDark': 'Switch to dark mode',
  'shell.signOut': 'Sign out',
  'shell.language': 'Language',
  'shell.jurisdiction': 'Jurisdiction',
  'shell.more': 'More',

  // Login screen.
  'login.signIn': 'Sign in',
  'login.signingIn': 'Signing in…',
  'login.lead': 'Authenticate to load the live audit workspace.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.emailInvalid': 'Enter a valid email address.',
  'login.passwordRequired': 'Enter your password.',
  'login.failed':
    'Sign-in failed. Check the credentials, or that the backend (MongoDB + JWT_SECRET) is configured.',
  'login.demoAuditor': 'Demo as auditor',
  'login.demoClient': 'Demo as client (auditee)',
  'login.sso': 'Single sign-on (SSO)',
  'login.ssoSubmit': 'Sign in with SSO',
  'login.ssoRedirecting': 'Redirecting…',

  // Registers — jurisdiction-aware framing hint.
  'registers.compliance.framingPrefix': 'Jurisdiction default:',
} as const;

/** Every valid message key, derived from the English catalog. */
export type MessageKey = keyof typeof en;

/** Shape every locale must satisfy. */
export type MessageCatalog = Record<MessageKey, string>;
