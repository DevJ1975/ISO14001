import type { MessageCatalog } from './en';

/**
 * French message catalog.
 *
 * Typed as `Partial<MessageCatalog>` so it can be added to incrementally —
 * any missing key falls back to the English source at lookup time. Keys present
 * here are type-checked against the English catalog, so a typo cannot ship.
 */
export const fr: Partial<MessageCatalog> = {
  'common.save': 'Enregistrer',
  'common.add': 'Ajouter',
  'common.remove': 'Supprimer',
  'common.cancel': 'Annuler',
  'common.export': 'Exporter',
  'common.close': 'Fermer',
  'common.search': 'Rechercher',
  'common.settings': 'Paramètres',
  'common.language': 'Langue',
  'common.jurisdiction': 'Juridiction',

  'nav.overview': "Vue d'ensemble",
  'nav.analytics': 'Analytique',
  'nav.actions': 'Actions',
  'nav.audits': 'Audits',
  'nav.audit': 'Audit',
  'nav.fieldwork': 'Travail sur site',
  'nav.evidence': 'Preuves',
  'nav.findings': 'Constats',
  'nav.registers': 'Registres',
  'nav.people': 'Personnes et sites',
  'nav.report': 'Rapport',
  'nav.programme': 'Programme',
  'nav.requests': 'Demandes',
  'nav.portal': 'Portail client',
  'nav.retention': 'Conservation',
  'nav.users': 'Utilisateurs',

  'shell.source.live': 'En direct',
  'shell.source.local': 'Local',
  'shell.source.offline': 'Hors ligne',
  'shell.source.hint.live': 'Connecté au serveur en direct',
  'shell.source.hint.offline': 'Hors ligne — les modifications sont mises en file sur cet appareil',
  'shell.source.hint.local': 'Stockage local — serveur non connecté',
  'shell.online': 'En ligne',
  'shell.offline': 'Hors ligne',
  'shell.syncNow': 'Synchroniser',
  'shell.search': 'Rechercher des sections',
  'shell.tour': 'Lancer la visite guidée',
  'shell.theme.toLight': 'Passer en mode clair',
  'shell.theme.toDark': 'Passer en mode sombre',
  'shell.signOut': 'Se déconnecter',
  'shell.language': 'Langue',
  'shell.jurisdiction': 'Juridiction',

  'login.signIn': 'Se connecter',
  'login.signingIn': 'Connexion…',
  'login.lead': "Authentifiez-vous pour charger l'espace de travail d'audit.",
  'login.email': 'E-mail',
  'login.password': 'Mot de passe',
  'login.emailInvalid': 'Saisissez une adresse e-mail valide.',
  'login.passwordRequired': 'Saisissez votre mot de passe.',
  'login.failed':
    'Échec de la connexion. Vérifiez les identifiants ou la configuration du serveur (MongoDB + JWT_SECRET).',
  'login.demoAuditor': "Démo en tant qu'auditeur",
  'login.demoClient': 'Démo en tant que client (audité)',
  'login.sso': 'Authentification unique (SSO)',
  'login.ssoSubmit': 'Se connecter avec le SSO',
  'login.ssoRedirecting': 'Redirection…',

  'registers.compliance.framingPrefix': 'Valeur par défaut de la juridiction :',
};
