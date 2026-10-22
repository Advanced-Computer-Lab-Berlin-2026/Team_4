/**
 * DEV ONLY (not mounted when NODE_ENV=production). Lets everyone work independently from day 1
 * without waiting for Register/Login/Lender-approval to be finished.
 *   POST /api/dev/login-as   { "role": "admin" | "member" | "lender" | "applicant" }
 *   (sets the auth cookie for a seeded user; run `npm run seed` first)
 * Remove this file at the end of Sprint 2 (or leave it - it is disabled in production).
 */
const router = require('express').Router();
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { setAuthCookie, clearAuthCookie } = require('../utils/tokens');

const SEEDED = { admin: 'admin', member: 'member1', member2: 'member2', lender: 'lender1', applicant: 'applicant' };

router.get('/users', asyncHandler(async (req, res) => {
  const users = await User.find({ username: { $in: Object.values(SEEDED) } }).select('username name role lenderStatus');
  res.json({ users });
}));

router.post('/login-as', asyncHandler(async (req, res) => {
  const username = SEEDED[req.body.role];
  if (!username) throw ApiError.badRequest(`role must be one of: ${Object.keys(SEEDED).join(', ')}`);
  const user = await User.findOne({ username });
  if (!user) throw ApiError.notFound('Seeded user not found - run "npm run seed" in /server');
  setAuthCookie(res, user._id);
  res.json({ user });
}));

router.post('/logout', (req, res) => { clearAuthCookie(res); res.json({ message: 'Logged out (dev)' }); });

module.exports = router;
