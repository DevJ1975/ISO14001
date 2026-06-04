import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Restrict the platform console to a signed-in superadmin; otherwise to its login. */
export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isSuperadmin() ? true : inject(Router).createUrlTree(['/admin/login']);
};
