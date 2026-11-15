import { lazy } from 'react';

export const member9Routes = [
  { path: '/notifications', access: 'member', element: lazy(() => import('../../pages/notifications/NotificationsPage')) },
  { path: '/account/notification-preferences', access: 'member', element: lazy(() => import('../../pages/account/NotificationPreferencesPage')) },
  { path: '/referrals', access: 'member', element: lazy(() => import('../../pages/referrals/MyReferralsPage')) },
  { path: '/admin/referrals', access: 'admin', element: lazy(() => import('../../pages/admin/AdminReferralReportPage')) },
];

export default member9Routes;
