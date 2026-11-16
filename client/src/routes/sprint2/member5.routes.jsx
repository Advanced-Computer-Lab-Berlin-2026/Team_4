// Sprint 2 routes - Owner: Member 5. Wired once by Member 1 into routeConfig.jsx (same shape as its entries).
// Contract: docs/sprint2/member5.md §8.1. More pages are added here as they are built.
import { lazy } from 'react';

const member5Routes = [
  { path: '/borrow-list', access: 'member', element: lazy(() => import('../../pages/borrow/BorrowListPage')) }, // Req 46-48
];

export default member5Routes;
