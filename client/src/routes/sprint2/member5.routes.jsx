// Sprint 2 routes - Owner: Member 5. Found automatically by routeConfig.jsx (src/routes/sprint2/*.routes.jsx).
// Contract: docs/sprint2/member5.md §8.1. More pages are added here as they are built.
import { lazy } from 'react';

const member5Routes = [
  { path: '/borrow-list', access: 'member', element: lazy(() => import('../../pages/borrow/BorrowListPage')) }, // Req 46-48
  { path: '/reservations', access: 'member', element: lazy(() => import('../../pages/lifecycle/MyReservationsPage')) }, // Req 53, 54
  { path: '/reservations/:id', access: 'member', element: lazy(() => import('../../pages/lifecycle/ReservationDetailsPage')) }, // Req 53
  { path: '/lender/reservations', access: 'lender', element: lazy(() => import('../../pages/lifecycle/LenderReservationsPage')) }, // Req 56-60
];

export default member5Routes;
