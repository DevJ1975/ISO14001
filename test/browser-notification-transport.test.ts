import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BrowserNotificationTransport } from '../src/app/core/notifications/browser-notification-transport';
import type { NotificationItem } from '../src/app/core/notifications/notifications.logic';

const item: NotificationItem = {
  id: 'capa-1',
  severity: 'critical',
  category: 'CAPA',
  title: 'Overdue CAPA',
  due: '2026-06-01',
  link: '/findings',
  read: false,
};

test('email is recorded as a would-send (no provider wired) and reports success', async () => {
  const transport = new BrowserNotificationTransport();
  const ok = await transport.send('email', { ...item });
  assert.equal(ok, true);
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0]!.channel, 'email');
  assert.equal(transport.sent[0]!.notificationId, 'capa-1');
});

test('push logs the attempt but reports false when the Notifications API is unavailable', async () => {
  // The Node test runtime has no global Notification, exercising the fallback path.
  const transport = new BrowserNotificationTransport();
  const ok = await transport.send('push', { ...item });
  assert.equal(ok, false);
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0]!.channel, 'push');
});
