// Member 7 route module - Member 1 imports this once into routeConfig.jsx (do not edit routeConfig yourself).
import { lazy } from 'react';

export default [
  { path: '/waitlists', access: 'member', element: lazy(() => import('../../pages/waitlists/MyWaitlistsPage')) },
];
