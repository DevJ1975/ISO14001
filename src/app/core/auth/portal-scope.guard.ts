import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Keep each role in its own surface within the tenant shell:
 *  - the platform superadmin belongs in the /admin console, not the workspace;
 *  - auditee (clientViewer) sessions are confined to /portal.
 * Auditor roles pass through untouched. This is a UX guard — the API enforces
 * the real authorisation.
 */
export const portalScopeGuard: CanActivateChildFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isSuperadmin()) return router.createUrlTree(['/admin']);
  if (!auth.isAuditee()) return true;
  const path = route.routeConfig?.path ?? '';
  return path === 'portal' ? true : router.createUrlTree(['/portal']);
};
