import type { NotificationChannel, NotificationItem } from './notifications.logic';
import type { NotificationTransport, SentRecord } from './notification-transport';

/**
 * Client-side delivery transport.
 *
 * - **push**: delivered for real via the browser Notifications API — no server
 *   needed. Requires the user to have granted notification permission (requested
 *   from the settings screen); if permission is missing the attempt is recorded
 *   but reports `false` so the bookkeeping reflects that nothing was shown.
 * - **email**: still needs server-side infrastructure (a mail provider), which is
 *   not wired here, so it is recorded as a would-send entry — the same explicit
 *   stub boundary as before.
 *
 * Every attempt is appended to `sent` so a delivery log can be surfaced.
 */
export class BrowserNotificationTransport implements NotificationTransport {
  readonly sent: SentRecord[] = [];

  send(channel: Exclude<NotificationChannel, 'inApp'>, notification: NotificationItem): Promise<boolean> {
    this.sent.push({
      channel,
      notificationId: notification.id,
      title: notification.title,
      at: new Date().toISOString(),
    });
    // push: delivered for real via the browser. email: no mail provider here, so
    // the recorded intent above is all we can do.
    return Promise.resolve(channel === 'push' ? this.showPush(notification) : true);
  }

  private showPush(notification: NotificationItem): boolean {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    try {
      const body = [notification.category, notification.due ? `due ${notification.due}` : '']
        .filter(Boolean)
        .join(' · ');
      const shown = new Notification(notification.title, { body, tag: notification.id });
      return Boolean(shown);
    } catch {
      return false;
    }
  }
}
