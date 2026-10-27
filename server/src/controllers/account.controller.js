/**
 * ACCOUNT CONTROLLER - Owner: Member 2 (Account, Passwords & Wallet)
 * Requirements: 10, 12, 36
 * Mounted at /api/account (see routes/account.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { CURRENCY } = require('../config/constants');

const ADDRESS_KEYS = ['street', 'city', 'state', 'postalCode', 'country'];

/**
 * PUT /api/account/password - Req 10 - any logged-in user
 * Body: { currentPassword, newPassword }  (strength already checked by passwordRule in the route)
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  // protect loads the user without passwordHash (select:false), so load it again with the hash.
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw ApiError.unauthorized();

  if (!(await user.checkPassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect', [{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  if (await user.checkPassword(newPassword)) {
    throw ApiError.badRequest('New password must be different from the current one', [{ field: 'newPassword', message: 'New password must be different from the current one' }]);
  }

  await user.setPassword(newPassword);
  await user.save();
  // Any reset code requested before this change is now stale.
  await PasswordResetOtp.deleteMany({ user: user._id });
  res.json({ message: 'Password changed successfully' });
});

/**
 * PUT /api/account/profile - Req 12 - member
 * Body: { phone?, address?: { street?, city?, state?, postalCode?, country? } }
 * Only these fields are copied from the body, so a member cannot change role, walletBalance, etc.
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const { phone, address } = req.body;
  const user = req.user;
  const addressKeys = address ? ADDRESS_KEYS.filter((key) => address[key] !== undefined) : [];
  if (phone === undefined && !addressKeys.length) throw ApiError.badRequest('Nothing to update');

  if (phone !== undefined) user.phone = phone;
  addressKeys.forEach((key) => user.set(`address.${key}`, address[key]));

  // Mongoose validators run on save; a phone already used by someone else -> 409 via errorHandler.
  // Saving the same values again is a no-op, not an error.
  if (user.isModified()) await user.save();
  res.json({ user });
});

/**
 * GET /api/account/wallet - Req 36 - member
 * Returns the current wallet balance. (The transaction history arrives in Sprint 2.)
 */
exports.getWallet = asyncHandler(async (req, res) => {
  res.json({ balance: req.user.walletBalance || 0, currency: CURRENCY });
});
