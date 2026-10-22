/**
 * AUTH CONTROLLER - Owner: Member 1
 * Requirements: 1 (register), 4 (login), 5 (logout)
 *
 * Conventions (everyone follows these):
 *   success  -> res.json({ user })          (auth endpoints always return the user object)
 *   failure  -> throw ApiError.xxx(...)      (errorHandler formats it)
 *   cookie   -> setAuthCookie(res, user._id) / clearAuthCookie(res)  from utils/tokens
 *   passwords-> user.setPassword(plain) then user.save();  user.checkPassword(plain)
 *               (passwordHash is select:false => User.findOne(...).select('+passwordHash'))
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { setAuthCookie, clearAuthCookie } = require('../utils/tokens');

/**
 * POST /api/auth/register - Req 1 - public
 * body: { username, name, email, password, phone, address: { street, city, state?, postalCode?, country? } }
 * TODO(M1): validate (add express-validator rules in auth.routes.js using passwordRule('password')),
 *           create the user (role 'member'), log them in (set cookie), return { user } with 201.
 *           Duplicate username/email/phone is already turned into a 409 by errorHandler.
 */
exports.register = asyncHandler(async () => {
  throw ApiError.notImplemented('register');
});

/**
 * POST /api/auth/login - Req 4 - public (members AND admins use the same endpoint)
 * body: { username, password }
 * TODO(M1): find user by lowercased username (+passwordHash), check password, REJECT suspended accounts
 *           with ApiError.forbidden('Your account has been suspended'), set cookie, return { user }.
 *           Use the SAME generic message for unknown user / wrong password (don't leak which).
 */
exports.login = asyncHandler(async () => {
  throw ApiError.notImplemented('login');
});

/**
 * POST /api/auth/logout - Req 5 - public
 * TODO(M1): clearAuthCookie(res); res.json({ message: 'Logged out' })
 */
exports.logout = asyncHandler(async () => {
  throw ApiError.notImplemented('logout');
});

/** GET /api/auth/me - PRE-IMPLEMENTED. The React AuthContext calls this on every page load. */
exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

// keep imports referenced so linters don't complain until M1 uses them
void User; void setAuthCookie; void clearAuthCookie;
