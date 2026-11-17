import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = (path) => readFile(resolve(process.cwd(), path), 'utf8');

test('Member 9 client exposes the expected API methods and route access policies', async () => {
  const [notifications, preferences, referrals, routes] = await Promise.all([
    source('src/api/notifications.api.js'),
    source('src/api/notificationPreferences.api.js'),
    source('src/api/referrals.api.js'),
    source('src/routes/sprint2/member9.routes.jsx'),
  ]);
  assert.match(notifications, /getUnreadNotificationCount/);
  assert.match(notifications, /markAllNotificationsRead/);
  assert.match(preferences, /updateNotificationPreferences/);
  assert.match(referrals, /captureReferral/);
  assert.match(routes, /path: '\/notifications', access: 'member'/);
  assert.match(routes, /path: '\/account\/notification-preferences', access: 'member'/);
  assert.match(routes, /path: '\/referrals', access: 'member'/);
  assert.match(routes, /path: '\/admin\/referrals', access: 'admin'/);
});

test('preference and notification UI keeps in-app notice and keyboard focus affordances', async () => {
  const [preferences, styles] = await Promise.all([
    source('src/pages/account/NotificationPreferencesPage.jsx'),
    source('src/styles/sprint2/member9.module.css'),
  ]);
  assert.match(preferences, /In-app notifications are always retained/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /max-width: 600px/);
});
