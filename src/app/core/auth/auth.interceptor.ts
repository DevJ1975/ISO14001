import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import { AuthService } from './auth.service';

/**
 * For calls to the backend API base, attach the Supabase anon key (so the
 * gateway routes to the edge function) and the app's bearer token when signed
 * in (the edge function does its own auth). The login call carries no bearer.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  const token = inject(AuthService).token();
  if (!req.url.startsWith(config.apiBaseUrl)) {
    return next(req);
  }
  const headers: Record<string, string> = {};
  if (config.supabaseAnonKey) {
    headers['apikey'] = config.supabaseAnonKey;
  }
  if (token && !req.url.endsWith('/auth/login')) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return Object.keys(headers).length > 0 ? next(req.clone({ setHeaders: headers })) : next(req);
};
