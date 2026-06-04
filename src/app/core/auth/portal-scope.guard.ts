import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Keep auditee (clientViewer) sessions inside the client portal. The auditor
 * workspace routes are redirected to /portal; auditor roles pass through
 * untouched. This is a UX guard — the API enforces the real authorisation.
 */
export const portalScopeGuard: CanActivateChildFn = (route) => {
  const auth = inject(AuthService);
  if (!auth.isAuditee()) return true;
  const path = route.routeConfig?.path ?? '';
  return path === 'portal' ? true : inject(Router).createUrlTree(['/portal']);
};
