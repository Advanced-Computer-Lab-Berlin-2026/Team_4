// Member 8 routes - discovered automatically by routes/routeConfig.jsx
import { lazy } from 'react';

const MembershipPlansPage = lazy(() => import('../../pages/membership/MembershipPlansPage'));
const AdminMembershipReportPage = lazy(() => import('../../pages/admin/AdminMembershipReportPage'));

export default [
  { path: '/membership', access: 'member', element: MembershipPlansPage },
  { path: '/admin/membership-report', access: 'admin', element: AdminMembershipReportPage },
];
