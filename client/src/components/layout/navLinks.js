// FOUNDATION - nav links per audience (pre-populated). Owner of Navbar: Member 1.
import routes from '../../routes/routeConfig';

function isRegistered(path) {
  return routes.some((route) => route.path === path);
}

function ifRegistered(to, label, path = to) {
  return isRegistered(path) ? [{ to, label }] : [];
}

export const guestLinks = [
  { to: '/catalog', label: 'Browse items' },
  { to: '/login', label: 'Login' },
  { to: '/register', label: 'Register' },
];

export const memberLinks = [
  { to: '/catalog', label: 'Browse items' },
  { to: '/reserve', label: 'Reserve' },
  ...ifRegistered('/borrow-list', 'Borrow list'),
  { to: isRegistered('/reservations') ? '/reservations' : '/my-reservations', label: 'Reservations' },
  ...ifRegistered('/damage-reports', 'Damage cases'),
  ...ifRegistered('/reviews/mine', 'My reviews'),
  ...ifRegistered('/delivery-tracking', 'Deliveries', '/delivery-tracking/:reservationId?'),
  { to: '/favorites', label: 'Favorites' },
  { to: '/household', label: 'Household' },
  { to: '/notices', label: 'Notices' },
  ...ifRegistered('/support', 'Support'),
  { to: '/account/wallet', label: 'Wallet' },
  ...ifRegistered('/account/late-fees', 'Late fees'),
  ...ifRegistered('/membership', 'Membership'),
  ...ifRegistered('/referrals', 'Referrals'),
  ...ifRegistered('/account/notification-preferences', 'Email preferences'),
];

// extra links shown only to verified lenders / members who can still apply
export const lenderLinks = [
  { to: '/lender/items', label: 'My items' },
  ...ifRegistered('/lender/reservations', 'Booking requests'),
  ...ifRegistered('/lender/dashboard', 'Lending dashboard'),
];
export const applyLink = { to: '/lender/apply', label: 'Become a lender' };

export const adminLinks = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/lender-applications', label: 'Applications' },
  { to: '/admin/items', label: 'Listings' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/notices', label: 'Notices' },
  ...ifRegistered('/admin/support', 'Support tickets'),
  ...ifRegistered('/admin/moderation', 'Moderation'),
  ...ifRegistered('/admin/reports/usage', 'Usage report'),
  ...ifRegistered('/admin/reports/damage', 'Damage report'),
  ...ifRegistered('/admin/damage-reports', 'Damage cases'),
  ...ifRegistered('/admin/membership-report', 'Membership report'),
  ...ifRegistered('/admin/referrals', 'Referral report'),
  ...ifRegistered('/admin/promo-codes', 'Promo codes'),
  ...ifRegistered('/admin/promo-usage', 'Promo usage'),
];

// account dropdown (any logged-in user)
export const accountLinks = [
  { to: '/account/profile', label: 'Profile', memberOnly: true },
  { to: '/account/password', label: 'Change password' },
];
