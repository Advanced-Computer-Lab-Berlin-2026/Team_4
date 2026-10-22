// FOUNDATION - nav links per audience (pre-populated). Owner of Navbar: Member 1.
export const guestLinks = [
  { to: '/catalog', label: 'Browse items' },
  { to: '/login', label: 'Login' },
  { to: '/register', label: 'Register' },
];

export const memberLinks = [
  { to: '/catalog', label: 'Browse items' },
  { to: '/favorites', label: 'Favorites' },
  { to: '/household', label: 'Household' },
  { to: '/notices', label: 'Notices' },
  { to: '/account/wallet', label: 'Wallet' },
];

// extra links shown only to verified lenders / members who can still apply
export const lenderLinks = [{ to: '/lender/items', label: 'My items' }];
export const applyLink = { to: '/lender/apply', label: 'Become a lender' };

export const adminLinks = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/lender-applications', label: 'Applications' },
  { to: '/admin/items', label: 'Listings' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/notices', label: 'Notices' },
];

// account dropdown (any logged-in user)
export const accountLinks = [
  { to: '/account/profile', label: 'Profile', memberOnly: true },
  { to: '/account/password', label: 'Change password' },
];
