import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';

import { AlertsService } from '../alerts/alerts.service';
import { NOTIFICATION_TRANSPORT, NotificationTransport } from './notification-transport';
import {
  NotificationChannel,
  NotificationItem,
  NotificationPrefs,
  channelsFor,
  defaultNotificationPrefs,
  deriveNotifications,
  planDeliveries,
  unreadCount,
} from './notifications.logic';

const READ_KEY = 'trainovate-notif-read';
const PREFS_KEY = 'trainovate-notif-prefs';

/**
 * In-app notification centre built on the alerts engine. Owns read/unread state
 * and per-channel preferences (persisted to localStorage), derives the live
 * notification list, and dispatches external deliveries through the injected
 * transport. The in-app channel needs no transport; email/push are delivered via
 * the (stubbed) transport so the boundary to real infrastructure is explicit.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly alerts = inject(AlertsService);
  private readonly transport = inject<NotificationTransport>(NOTIFICATION_TRANSPORT, { optional: true });

  private readonly readIds = signal<ReadonlySet<string>>(this.loadReadIds());
  readonly prefs = signal<NotificationPrefs>(this.loadPrefs());

  /** Browser notification permission state, or 'unsupported' where the API is absent. */
  readonly pushPermission = signal<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  /** Keys ("id|channel") already dispatched to an external channel this session. */
  private readonly delivered = new Set<string>();

  readonly notifications: Signal<NotificationItem[]> = computed(() =>
    deriveNotifications(this.alerts.alerts(), this.prefs(), this.readIds()),
  );

  readonly unread = computed(() => unreadCount(this.notifications()));

  constructor() {
    // Dispatch external deliveries whenever the notification set or prefs change.
    effect(() => {
      const items = this.notifications();
      const prefs = this.prefs();
      if (channelsFor(prefs).every((c) => c === 'inApp')) return;
      const plans = planDeliveries(items, prefs, this.delivered);
      if (!plans.length || !this.transport) return;
      for (const plan of plans) {
        const item = items.find((n) => n.id === plan.notificationId);
        if (!item || plan.channel === 'inApp') continue;
        this.delivered.add(`${plan.notificationId}|${plan.channel}`);
        void this.transport.send(plan.channel, item);
      }
    });
  }

  markRead(id: string): void {
    this.readIds.update((set) => new Set(set).add(id));
    this.persistReadIds();
  }

  markAllRead(): void {
    this.readIds.set(new Set(this.notifications().map((n) => n.id)));
    this.persistReadIds();
  }

  setChannel(channel: NotificationChannel, on: boolean): void {
    this.prefs.update((p) => ({ ...p, channels: { ...p.channels, [channel]: channel === 'inApp' ? true : on } }));
    this.persistPrefs();
  }

  /**
   * Turn the push channel on, requesting browser notification permission first.
   * Only enables the channel when permission is granted, so a denied/blocked
   * prompt never leaves a channel that can't actually deliver.
   */
  async enablePush(): Promise<void> {
    if (typeof Notification === 'undefined') {
      this.pushPermission.set('unsupported');
      return;
    }
    const permission =
      Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    this.pushPermission.set(permission);
    this.setChannel('push', permission === 'granted');
  }

  setMinSeverity(minSeverity: NotificationPrefs['minSeverity']): void {
    this.prefs.update((p) => ({ ...p, minSeverity }));
    this.persistPrefs();
  }

  toggleMutedCategory(category: string): void {
    this.prefs.update((p) => {
      const muted = new Set(p.mutedCategories.map((c) => c.toLowerCase()));
      const key = category.toLowerCase();
      if (muted.has(key)) muted.delete(key);
      else muted.add(key);
      return { ...p, mutedCategories: [...muted] };
    });
    this.persistPrefs();
  }

  private loadReadIds(): ReadonlySet<string> {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(READ_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }

  private persistReadIds(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(READ_KEY, JSON.stringify([...this.readIds()]));
  }

  private loadPrefs(): NotificationPrefs {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PREFS_KEY);
      return raw ? { ...defaultNotificationPrefs(), ...(JSON.parse(raw) as Partial<NotificationPrefs>) } : defaultNotificationPrefs();
    } catch {
      return defaultNotificationPrefs();
    }
  }

  private persistPrefs(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs()));
  }
}
