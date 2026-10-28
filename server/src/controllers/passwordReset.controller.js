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

// Public reset endpoints deliberately do not reveal whether an account/reset record exists.
const GENERIC_REPLY = { message: 'If an account exists for that email, a reset code has been sent.' };
const INVALID_RESET = 'Invalid or expired reset request.';

/**
 * POST /api/password-reset/request - Req 11 - public
 * Body: { email }. Generates a 6-digit OTP, stores only its bcrypt hash, emails the plain code.
 */
exports.requestOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email, role: 'member' });
  if (!user) return res.json(GENERIC_REPLY);

  // crypto.randomInt is cryptographically secure (Math.random is predictable).
  const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const otpHash = await bcrypt.hash(otp, 10);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.OTP_EXPIRY_MINUTES * 60 * 1000);
  const cooldownCutoff = new Date(now.getTime() - RESEND_COOLDOWN_MS);

  let record;
  try {
    // Atomic replacement: either update the user's old/cooldown-expired record or insert the
    // user's one record. The unique user index makes simultaneous requests race safely:
    // only one can win; the loser gets E11000 and returns the same generic reply.
    record = await PasswordResetOtp.findOneAndUpdate(
      {
        user: user._id,
        $or: [
          { lastSentAt: { $lte: cooldownCutoff } },
          { lastSentAt: { $exists: false } },
        ],
      },
      {
        $set: {
          email: user.email,
          otpHash,
          expiresAt,
          lastSentAt: now,
          attempts: 0,
          usedAt: null,
        },
        $setOnInsert: { user: user._id },
      },
      { new: true, upsert: true, runValidators: true }
    );
  } catch (err) {
    if (err?.code === 11000) return res.json(GENERIC_REPLY);
    throw err;
  }

  if (!record) return res.json(GENERIC_REPLY);

  try {
    await sendEmail({
      to: user.email,
      subject: 'Your ShareShed password reset code',
      text: `Hi ${user.name},\n\nYour password reset code is: ${otp}\n\nIt expires in ${env.OTP_EXPIRY_MINUTES} minutes. If you did not request this, you can ignore this email.`,
    });
  } catch (err) {
    // If delivery fails, remove only the record created/replaced by this request so the user
    // can retry immediately instead of being stuck behind the resend cooldown.
    await PasswordResetOtp.deleteOne({ _id: record._id, lastSentAt: now });
    throw err;
  }

  res.json(GENERIC_REPLY);
});

/**
 * POST /api/password-reset/confirm - Req 11 - public member reset
 * Body: { email, otp, newPassword }. Verifies the code and sets the new password.
 */
exports.confirmReset = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email, role: 'member' });
  if (!user) throw ApiError.badRequest(INVALID_RESET);

  // The TTL index only deletes expired docs about once a minute, so also check expiresAt here.
  const record = await PasswordResetOtp.findOne({ user: user._id, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!record) throw ApiError.badRequest(INVALID_RESET);

  // Count the attempt atomically BEFORE comparing, so parallel guesses can't exceed the limit.
  const counted = await PasswordResetOtp.findOneAndUpdate(
    { _id: record._id, attempts: { $lt: MAX_ATTEMPTS }, usedAt: null, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!counted) throw ApiError.badRequest(INVALID_RESET);

  if (!(await bcrypt.compare(otp, counted.otpHash))) {
    throw ApiError.badRequest(INVALID_RESET);
  }

  // Mark as used atomically, so the same code can't be redeemed twice.
  const claimed = await PasswordResetOtp.findOneAndUpdate(
    { _id: counted._id, usedAt: null },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!claimed) throw ApiError.badRequest(INVALID_RESET);

  await user.setPassword(newPassword);
  await user.save();
  await PasswordResetOtp.deleteOne({ _id: counted._id });
  res.json({ message: 'Password reset successfully. You can now log in.' });
});

/**
 * POST /api/password-reset/admin - Req 11 admin recovery
 * Access: admin only. An authenticated admin can reset ANOTHER admin's forgotten password.
 * Admins do not require email addresses in the current User model, so they do not use email OTP.
 */
exports.adminResetPassword = asyncHandler(async (req, res) => {
  const { username, newPassword } = req.body;
  const target = await User.findOne({ username, role: 'admin' });
  if (!target) throw ApiError.notFound('Admin account not found');

  if (target._id.equals(req.user._id)) {
    throw ApiError.badRequest('Use change password to update your own password');
  }

  await target.setPassword(newPassword);
  await target.save();
  await PasswordResetOtp.deleteMany({ user: target._id });

  res.json({ message: `Password reset for admin ${target.username}` });
});
