// FOUNDATION - PRE-POPULATED with every Sprint 1 page. Nobody needs to edit this file:
// each member just fills in their own page component.  (Sprint 2: add new routes at the bottom.)
//
// access:  public = anyone | guest = only logged-OUT users | auth = any logged-in user
//          member = role member | lender = verified lender | admin = role admin
import { lazy } from 'react';

const P = (loader) => lazy(loader);

const routes = [
  // ---- public
  { path: '/', access: 'public', element: P(() => import('../pages/HomePage')) },
  { path: '/catalog', access: 'public', element: P(() => import('../pages/items/CatalogPage')) },
  { path: '/catalog/:id', access: 'public', element: P(() => import('../pages/items/ItemDetailsPage')) },
  { path: '/categories/:slug', access: 'public', element: P(() => import('../pages/items/CategoryPage')) },

  // ---- guest only
  { path: '/register', access: 'guest', element: P(() => import('../pages/auth/RegisterPage')) },
  { path: '/login', access: 'guest', element: P(() => import('../pages/auth/LoginPage')) },
  { path: '/forgot-password', access: 'guest', element: P(() => import('../pages/auth/ForgotPasswordPage')) },
  { path: '/reset-password', access: 'guest', element: P(() => import('../pages/auth/ResetPasswordPage')) },

  // ---- any logged-in user (member or admin)
  { path: '/account/password', access: 'auth', element: P(() => import('../pages/account/ChangePasswordPage')) },

  // ---- member
  { path: '/account/profile', access: 'member', element: P(() => import('../pages/account/ProfilePage')) },
  { path: '/account/wallet', access: 'member', element: P(() => import('../pages/account/WalletPage')) },
  { path: '/household', access: 'member', element: P(() => import('../pages/household/HouseholdPage')) },
  { path: '/favorites', access: 'member', element: P(() => import('../pages/favorites/FavoritesPage')) },
  { path: '/notices', access: 'member', element: P(() => import('../pages/notices/NoticeBoardPage')) },
  { path: '/lender/apply', access: 'member', element: P(() => import('../pages/lender/LenderApplyPage')) },

  // ---- verified lender
  { path: '/lender/items', access: 'lender', element: P(() => import('../pages/lender/MyItemsPage')) },
  { path: '/lender/items/new', access: 'lender', element: P(() => import('../pages/lender/ItemEditorPage')) },
  { path: '/lender/items/:id/edit', access: 'lender', element: P(() => import('../pages/lender/ItemEditorPage')) },

  // ---- admin
  { path: '/admin', access: 'admin', element: P(() => import('../pages/admin/AdminDashboardPage')) },
  { path: '/admin/admins/new', access: 'admin', element: P(() => import('../pages/admin/AdminAddAdminPage')) },
  { path: '/admin/users', access: 'admin', element: P(() => import('../pages/admin/AdminUsersPage')) },
  { path: '/admin/users/:id', access: 'admin', element: P(() => import('../pages/admin/AdminUserDetailPage')) },
  { path: '/admin/lender-applications', access: 'admin', element: P(() => import('../pages/admin/AdminLenderApplicationsPage')) },
  { path: '/admin/lender-applications/:id', access: 'admin', element: P(() => import('../pages/admin/AdminLenderApplicationDetailPage')) },
  { path: '/admin/items', access: 'admin', element: P(() => import('../pages/admin/AdminItemsPage')) },
  { path: '/admin/categories', access: 'admin', element: P(() => import('../pages/admin/AdminCategoriesPage')) },
  { path: '/admin/notices', access: 'admin', element: P(() => import('../pages/admin/AdminNoticesPage')) },

  // ---- Sprint 2 routes go here (reservations, borrow list, wallet top-ups, membership, ...)
];

export default routes;
