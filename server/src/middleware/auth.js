const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { COOKIE_NAME } = require('../utils/tokens');
const { USER_STATUS } = require('../config/constants');

const extractToken = (req) => {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const h = req.headers.authorization; // Bearer token also accepted (handy for Postman)
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
};

async function loadUser(req) {
  const token = extractToken(req);
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (e) {
    return null;
  }
  return User.findById(payload.id);
}

/** NFR 5: requires a logged-in user. Sets req.user. Rejects suspended accounts. */
const protect = asyncHandler(async (req, res, next) => {
  const user = await loadUser(req);
  if (!user) throw ApiError.unauthorized();
  if (user.status === USER_STATUS.SUSPENDED) throw ApiError.forbidden('Your account has been suspended');
  req.user = user;
  next();
});

/** For public routes that behave differently when logged in. Never throws; req.user may be undefined. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const user = await loadUser(req);
  if (user && user.status === USER_STATUS.ACTIVE) req.user = user;
  next();
});

module.exports = { protect, optionalAuth };
