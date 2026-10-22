const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'shareshed_token';

const signToken = (userId) => jwt.sign({ id: String(userId) }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const setAuthCookie = (res, userId) => res.cookie(COOKIE_NAME, signToken(userId), cookieOptions());
const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });

module.exports = { COOKIE_NAME, signToken, setAuthCookie, clearAuthCookie };
