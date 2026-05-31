import type { AlertItem, AlertSeverity } from '../alerts/alerts.logic';

/**
 * Notification layer built on top of the alerts engine: it turns the live
 * "needs attention" list into user-facing notifications with read/unread state
 * and per-channel routing. Kept pure so the Node suite can exercise the
 * filtering, severity gating and channel planning directly.
 */
export type NotificationChannel = 'inApp' | 'email' | 'push';

export interface NotificationPrefs {
  /** Channels the user has switched on. `inApp` is always effectively on. */
  channels: Record<NotificationChannel, boolean>;
  /** Lowest severity that should notify (info = everything, critical = only criticals). */
  minSeverity: AlertSeverity;
  /** Categories the user has muted (matched case-insensitively against the alert category). */
  mutedCategories: string[];
}

export const defaultNotificationPrefs = (): NotificationPrefs => ({
  channels: { inApp: true, email: false, push: false },
  minSeverity: 'warning',
  mutedCategories: [],
});

export interface NotificationItem {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  due?: string;
  link: string;
  fragment?: string;
  read: boolean;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** True if `severity` is at least as urgent as the preference threshold. */
export function meetsSeverity(severity: AlertSeverity, min: AlertSeverity): boolean {
  return SEVERITY_RANK[severity] <= SEVERITY_RANK[min];
}

/**
 * Derive the in-app notification list from the current alerts, applying the
 * severity threshold and muted categories, and marking read state from `readIds`.
 * Order follows the alerts engine (already severity-then-due sorted).
 */
export function deriveNotifications(
  alerts: readonly AlertItem[],
  prefs: NotificationPrefs,
  readIds: ReadonlySet<string>,
): NotificationItem[] {
  const muted = new Set(prefs.mutedCategories.map((c) => c.toLowerCase()));
  return alerts
    .filter((a) => meetsSeverity(a.severity, prefs.minSeverity) && !muted.has(a.category.toLowerCase()))
    .map((a) => ({
      id: a.id,
      severity: a.severity,
      category: a.category,
      title: a.title,
      due: a.due,
      link: a.link,
      fragment: a.fragment,
      read: readIds.has(a.id),
    }));
}

/** Count unread notifications. */
export function unreadCount(notifications: readonly NotificationItem[]): number {
  return notifications.reduce((n, item) => (item.read ? n : n + 1), 0);
}

/** The channels a notification should be delivered on, given preferences. */
export function channelsFor(prefs: NotificationPrefs): NotificationChannel[] {
  const channels: NotificationChannel[] = ['inApp'];
  if (prefs.channels.email) channels.push('email');
  if (prefs.channels.push) channels.push('push');
  return channels;
}

export interface DeliveryPlan {
  notificationId: string;
  channel: NotificationChannel;
}

/**
 * Plan outbound deliveries: every notification not yet delivered on a channel is
 * scheduled for each enabled channel. `alreadyDelivered` holds `"id|channel"`
 * keys so a notification is delivered to each external channel at most once.
 */
export function planDeliveries(
  notifications: readonly NotificationItem[],
  prefs: NotificationPrefs,
  alreadyDelivered: ReadonlySet<string>,
): DeliveryPlan[] {
  const channels = channelsFor(prefs).filter((c) => c !== 'inApp');
  const plans: DeliveryPlan[] = [];
  for (const item of notifications) {
    for (const channel of channels) {
      if (!alreadyDelivered.has(`${item.id}|${channel}`)) {
        plans.push({ notificationId: item.id, channel });
      }
    }
  }
  return plans;
}
