// Member 2 client routes (Sprint 2). Member 1 imports this array into routeConfig.jsx once;
// entries use the same shape as routeConfig: { path, access, element }.
import { lazy } from 'react';

const P = (loader) => lazy(loader);

const member2Routes = [
  { path: '/account/late-fees', access: 'member', element: P(() => import('../../pages/account/LateFeesPage')) }, // Req 78
];

export default member2Routes;
