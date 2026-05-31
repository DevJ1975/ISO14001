import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AlertItem } from '../src/app/core/alerts/alerts.logic';
import {
  channelsFor,
  defaultNotificationPrefs,
  deriveNotifications,
  meetsSeverity,
  planDeliveries,
  unreadCount,
} from '../src/app/core/notifications/notifications.logic';

const alert = (over: Partial<AlertItem> & Pick<AlertItem, 'id' | 'severity' | 'category'>): AlertItem => ({
  title: over.title ?? `${over.category} item`,
  link: '/x',
  ...over,
});

const sampleAlerts: AlertItem[] = [
  alert({ id: 'a1', severity: 'critical', category: 'Permit' }),
  alert({ id: 'a2', severity: 'warning', category: 'Training' }),
  alert({ id: 'a3', severity: 'info', category: 'Sync' }),
];

describe('notifications logic', () => {
  it('gates by severity threshold', () => {
    assert.equal(meetsSeverity('critical', 'warning'), true);
    assert.equal(meetsSeverity('warning', 'warning'), true);
    assert.equal(meetsSeverity('info', 'warning'), false);
    assert.equal(meetsSeverity('info', 'info'), true);
  });

  it('derives notifications filtered by min severity and applies read state', () => {
    const prefs = { ...defaultNotificationPrefs(), minSeverity: 'warning' as const };
    const notes = deriveNotifications(sampleAlerts, prefs, new Set(['a1']));
    assert.deepEqual(notes.map((n) => n.id), ['a1', 'a2']); // info 'a3' filtered out
    assert.equal(notes.find((n) => n.id === 'a1')?.read, true);
    assert.equal(notes.find((n) => n.id === 'a2')?.read, false);
  });

  it('drops muted categories case-insensitively', () => {
    const prefs = { ...defaultNotificationPrefs(), minSeverity: 'info' as const, mutedCategories: ['training'] };
    const notes = deriveNotifications(sampleAlerts, prefs, new Set());
    assert.deepEqual(notes.map((n) => n.category), ['Permit', 'Sync']);
  });

  it('counts unread', () => {
    const notes = deriveNotifications(sampleAlerts, { ...defaultNotificationPrefs(), minSeverity: 'info' }, new Set(['a1']));
    assert.equal(unreadCount(notes), 2);
  });

  it('resolves enabled channels (in-app always present)', () => {
    assert.deepEqual(channelsFor(defaultNotificationPrefs()), ['inApp']);
    assert.deepEqual(
      channelsFor({ ...defaultNotificationPrefs(), channels: { inApp: true, email: true, push: true } }),
      ['inApp', 'email', 'push'],
    );
  });

  it('plans external deliveries once per channel, skipping already-delivered', () => {
    const prefs = { ...defaultNotificationPrefs(), minSeverity: 'info' as const, channels: { inApp: true, email: true, push: false } };
    const notes = deriveNotifications(sampleAlerts, prefs, new Set());
    const plans = planDeliveries(notes, prefs, new Set(['a1|email']));
    // email only (push disabled), and a1 already delivered → a2, a3 remain
    assert.deepEqual(plans, [
      { notificationId: 'a2', channel: 'email' },
      { notificationId: 'a3', channel: 'email' },
    ]);
  });

  it('plans nothing when only in-app is enabled', () => {
    const notes = deriveNotifications(sampleAlerts, defaultNotificationPrefs(), new Set());
    assert.deepEqual(planDeliveries(notes, defaultNotificationPrefs(), new Set()), []);
  });
});
