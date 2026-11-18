// Member 8 routes - discovered automatically by routes/routeConfig.jsx
import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

const MembershipPlansPage = lazy(() => import('../../pages/membership/MembershipPlansPage'));
const AdminMembershipReportPage = lazy(() => import('../../pages/admin/AdminMembershipReportPage'));

// Member 9's membership notifications use this account route.
function MembershipNotificationLink() {
  return <Navigate to="/membership" replace />;
}

export default [
  { path: '/membership', access: 'member', element: MembershipPlansPage },
  { path: '/account/membership', access: 'member', element: MembershipNotificationLink },
  { path: '/admin/membership-report', access: 'admin', element: AdminMembershipReportPage },
];
