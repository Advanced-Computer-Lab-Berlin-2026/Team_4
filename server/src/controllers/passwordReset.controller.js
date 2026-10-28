/**
 * PASSWORDRESET CONTROLLER - Owner: Member 2 (Account, Passwords & Wallet)
 * Requirements: 11
 * Mounted at /api/password-reset (see routes/passwordReset.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { sendEmail } = require('../utils/email');
const env = require('../config/env');

const MAX_ATTEMPTS = 5; // wrong guesses allowed per code
const RESEND_COOLDOWN_MS = 60 * 1000; // at most one email per minute per user

// Same reply whether or not the email exists, so this endpoint can't be used to discover accounts.
const GENERIC_REPLY = { message: 'If an account exists for that email, a reset code has been sent.' };
const INVALID_CODE = 'Invalid or expired code';

/**
 * POST /api/password-reset/request - Req 11 - public
 * Body: { email }. Generates a 6-digit OTP, stores only its bcrypt hash, emails the plain code.
 */
exports.requestOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json(GENERIC_REPLY);

  const recent = await PasswordResetOtp.findOne({ user: user._id, createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } });
  if (recent) return res.json(GENERIC_REPLY);

  // crypto.randomInt is cryptographically secure (Math.random is predictable).
  const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

  // Only one active code per user: requesting a new one invalidates the old ones.
  await PasswordResetOtp.deleteMany({ user: user._id });
  await PasswordResetOtp.create({ user: user._id, email: user.email, otpHash: await bcrypt.hash(otp, 10), expiresAt });

  await sendEmail({
    to: user.email,
    subject: 'Your ShareShed password reset code',
    text: `Hi ${user.name},\n\nYour password reset code is: ${otp}\n\nIt expires in ${env.OTP_EXPIRY_MINUTES} minutes. If you did not request this, you can ignore this email.`,
  });
  res.json(GENERIC_REPLY);
});

/**
 * POST /api/password-reset/confirm - Req 11 - public
 * Body: { email, otp, newPassword }. Verifies the code and sets the new password.
 */
exports.confirmReset = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw ApiError.badRequest(INVALID_CODE);

  // The TTL index only deletes expired docs about once a minute, so also check expiresAt here.
  const record = await PasswordResetOtp.findOne({ user: user._id, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!record) throw ApiError.badRequest(INVALID_CODE);

  // Count the attempt atomically BEFORE comparing, so parallel guesses can't exceed the limit.
  const counted = await PasswordResetOtp.findOneAndUpdate(
    { _id: record._id, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!counted) throw ApiError.badRequest('Too many wrong attempts. Please request a new code.');

  if (!(await bcrypt.compare(otp, counted.otpHash))) {
    const left = MAX_ATTEMPTS - counted.attempts;
    throw ApiError.badRequest(left > 0 ? `${INVALID_CODE} (${left} attempt${left === 1 ? '' : 's'} left)` : 'Too many wrong attempts. Please request a new code.');
  }

  // Mark as used atomically, so the same code can't be redeemed twice.
  const claimed = await PasswordResetOtp.findOneAndUpdate({ _id: counted._id, usedAt: null }, { usedAt: new Date() });
  if (!claimed) throw ApiError.badRequest(INVALID_CODE);

  await user.setPassword(newPassword);
  await user.save();
  await PasswordResetOtp.deleteMany({ user: user._id });
  res.json({ message: 'Password reset successfully. You can now log in.' });
});
