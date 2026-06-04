import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/auth/auth.interceptor';
import { BrowserNotificationTransport } from './app/core/notifications/browser-notification-transport';
import { NOTIFICATION_TRANSPORT } from './app/core/notifications/notification-transport';

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // Client-side transport: push via the browser Notifications API; email is
    // recorded only (needs a server mail provider). Swap for a fully
    // provider-backed transport in production without touching the UI.
    { provide: NOTIFICATION_TRANSPORT, useClass: BrowserNotificationTransport },
  ],
}).catch((error: unknown) => {
  console.error(error);
});
