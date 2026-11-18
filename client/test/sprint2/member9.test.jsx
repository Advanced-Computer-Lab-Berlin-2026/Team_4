import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../../src/api/axios';
import NotificationsPage from '../../src/pages/notifications/NotificationsPage';
import AdminReferralReportPage from '../../src/pages/admin/AdminReferralReportPage';
import NotificationBell from '../../src/components/sprint2/m9/NotificationBell';
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


vi.mock('../../src/api/axios', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error) => error.message,
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test('members can reach older notifications and the bell updates after marking all read', async () => {
  let unread = 1;
  api.get.mockImplementation(async (path, options) => {
    if (path.endsWith('unread-count')) return { data: { count: unread } };
    const page = options.params.page || 1;
    const items = [{
      _id: String(page), title: page === 1 ? 'Recent update' : 'Older unread update',
      createdAt: '2026-11-17T00:00:00Z', ...(page === 1 && { readAt: '2026-11-17T01:00:00Z' }),
    }];
    return { data: { items, page, pages: 2 } };
  });
  api.patch.mockImplementation(async () => {
    unread = 0;
    return { data: { modifiedCount: 1 } };
  });
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NotificationBell />
      <NotificationsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Notifications, 1 unread' });
  await screen.findByRole('heading', { name: 'Recent update' });
  expect(screen.getByRole('button', { name: 'Mark all as read' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: 'Older unread update' });
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
  await screen.findByRole('button', { name: 'Notifications', exact: true });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark all as read' }).disabled).toBe(true));
  expect(api.patch).toHaveBeenCalledWith('/notifications/read-all');
});

test('the admin report shows copies and signups separately and can open the next page', async () => {
  api.get.mockImplementation(async (_, { params: { page } }) => ({
    data: { items: [{
      _id: String(page), referrer: { name: 'Referrer ' + page }, status: 'sent', creditAmountMinor: 0, createdAt: '2026-11-17T00:00:00Z',
    }], total: 2, page, pages: 2, totals: { referralsSent: 2, signups: 0, conversions: 0, creditsIssuedMinor: 0, currency: 'EGP' } },
  }));
  render(<AdminReferralReportPage />);
  await screen.findByText('Referrer 1');
  expect(screen.getByText('Referral links copied')).toBeTruthy();
  expect(screen.getByText('Referral signups')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Referrer 2');
  expect(api.get).toHaveBeenLastCalledWith('/referrals/report', { params: { page: 2 } });
});
