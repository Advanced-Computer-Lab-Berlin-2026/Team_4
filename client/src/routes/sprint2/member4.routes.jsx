import { lazy } from 'react';

export default [
  { path: '/support', access: 'member', element: lazy(() => import('../../pages/support/MySupportTicketsPage')) },
  { path: '/support/:id', access: 'auth', element: lazy(() => import('../../pages/support/SupportTicketPage')) },
  { path: '/admin/moderation', access: 'admin', element: lazy(() => import('../../pages/admin/AdminModerationPage')) },
  { path: '/admin/reports/usage', access: 'admin', element: lazy(() => import('../../pages/admin/AdminUsageReportPage')) },
  { path: '/admin/reports/damage', access: 'admin', element: lazy(() => import('../../pages/admin/AdminDamageReportPage')) },
  { path: '/admin/support', access: 'admin', element: lazy(() => import('../../pages/admin/AdminSupportPage')) },
];
