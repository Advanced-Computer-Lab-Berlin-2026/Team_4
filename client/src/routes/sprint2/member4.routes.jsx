// Member 4 Sprint 2 Client Routes - Owner: Member 4
// Exported for Member 1 to wire into AppRoutes.jsx
import React from 'react';
import AdminModerationPage from '../../pages/admin/AdminModerationPage';
import AdminUsageReportPage from '../../pages/admin/AdminUsageReportPage';
import AdminDamageReportPage from '../../pages/admin/AdminDamageReportPage';
import AdminSupportPage from '../../pages/admin/AdminSupportPage';
import MySupportTicketsPage from '../../pages/support/MySupportTicketsPage';
import SupportTicketPage from '../../pages/support/SupportTicketPage';

export const member4Routes = [
    {
        path: '/support',
        element: <MySupportTicketsPage />,
        roles: ['member', 'lender', 'admin'],
    },
    {
        path: '/support/:id',
        element: <SupportTicketPage />,
        roles: ['member', 'lender', 'admin'],
    },
    {
        path: '/admin/moderation',
        element: <AdminModerationPage />,
        roles: ['admin'],
    },
    {
        path: '/admin/reports/usage',
        element: <AdminUsageReportPage />,
        roles: ['admin'],
    },
    {
        path: '/admin/reports/damage',
        element: <AdminDamageReportPage />,
        roles: ['admin'],
    },
    {
        path: '/admin/support',
        element: <AdminSupportPage />,
        roles: ['admin'],
    },
];

export default member4Routes;