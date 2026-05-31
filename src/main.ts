import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/auth/auth.interceptor';
import {
  LoggingNotificationTransport,
  NOTIFICATION_TRANSPORT,
} from './app/core/notifications/notification-transport';

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // Default (stubbed) external transport: records would-be email/push deliveries.
    // Swap for a real provider-backed transport in production.
    { provide: NOTIFICATION_TRANSPORT, useClass: LoggingNotificationTransport },
  ],
}).catch((error: unknown) => {
  console.error(error);
});
