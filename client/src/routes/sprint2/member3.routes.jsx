// SPRINT 2 ROUTES - Member 3 (damage evidence, disputes, reviews and trust)
// Same shape as src/routes/routeConfig.jsx. Member 1 adds this module to the app once (Stage 0); edit only this file.
// access: public | guest | auth | member | lender (verified) | admin
import { lazy } from 'react';

const P = (loader) => lazy(loader);

const member3Routes = [
  // ---- reviews and trust (Req 89, 90, 91, 97)
  { path: '/reviews/mine', access: 'member', element: P(() => import('../../pages/reviews/MyReviewsPage')) },
  { path: '/users/:userId/trust', access: 'auth', element: P(() => import('../../pages/reviews/TrustProfilePage')) },

  // ---- damage reports and disputes (Req 61, 63)
  { path: '/damage-reports', access: 'member', element: P(() => import('../../pages/damage/DamageReportPage')) },
  { path: '/damage-reports/new', access: 'lender', element: P(() => import('../../pages/damage/DamageReportPage')) },
  { path: '/damage-reports/:id', access: 'member', element: P(() => import('../../pages/damage/DamageReportPage')) },

  // ---- admin decisions (Req 62, 64, 80)
  { path: '/admin/damage-reports', access: 'admin', element: P(() => import('../../pages/admin/AdminDamageDecisionPage')) },
  { path: '/admin/damage-reports/:id', access: 'admin', element: P(() => import('../../pages/admin/AdminDamageDecisionPage')) },
];

export default member3Routes;
