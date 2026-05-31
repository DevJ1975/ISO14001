import { InjectionToken } from '@angular/core';

import type { NotificationChannel, NotificationItem } from './notifications.logic';

/**
 * Pluggable delivery transport for external notification channels (email/push).
 *
 * The in-app channel is handled entirely in the client (the bell + list), so it
 * needs no transport. Email and push require server-side infrastructure — an SMTP
 * / provider integration and a Web Push subscription with VAPID keys — which is
 * not available in this environment. We therefore ship a `LoggingNotificationTransport`
 * that records what *would* be sent, and expose this token so a real transport
 * can be provided in production without touching the notification service.
 */
export interface NotificationTransport {
  /** Deliver one notification on one external channel. Resolves true on success. */
  send(channel: Exclude<NotificationChannel, 'inApp'>, notification: NotificationItem): Promise<boolean>;
}

export const NOTIFICATION_TRANSPORT = new InjectionToken<NotificationTransport>('NOTIFICATION_TRANSPORT');

export interface SentRecord {
  channel: NotificationChannel;
  notificationId: string;
  title: string;
  at: string;
}

/**
 * Default transport: no real network send. It records each attempt so the UI can
 * show a delivery log ("would email / would push"), making the stubbed boundary
 * explicit rather than silently dropping or pretending to send.
 */
export class LoggingNotificationTransport implements NotificationTransport {
  readonly sent: SentRecord[] = [];

  send(channel: Exclude<NotificationChannel, 'inApp'>, notification: NotificationItem): Promise<boolean> {
    this.sent.push({ channel, notificationId: notification.id, title: notification.title, at: new Date().toISOString() });
    // No external infrastructure wired in this environment; report success for the
    // in-memory log so the delivery bookkeeping (delivered-set) stays consistent.
    return Promise.resolve(true);
  }
}
