// Member 1 — Requirements 1, 4, 5.
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { USER_STATUS } = require('../config/constants');
const { setAuthCookie, clearAuthCookie } = require('../utils/tokens');

exports.register = asyncHandler(async (req, res) => {
  const { username, name, email, password, phone, address } = req.body;
  // Explicitly select writable fields: guests cannot grant themselves privileges.
  const user = new User({ username, name, email, phone, address: {
    street: address.street, city: address.city, state: address.state,
    postalCode: address.postalCode, country: address.country,
  }, role: 'member' });
  await user.setPassword(password);
  await user.save();
  setAuthCookie(res, user._id);
  res.status(201).json({ user });
});

exports.login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.body.username }).select('+passwordHash');
  if (!user || !(await user.checkPassword(req.body.password))) {
    throw ApiError.unauthorized('Invalid username or password');
  }
  if (user.status === USER_STATUS.SUSPENDED) {
    throw ApiError.forbidden('Your account has been suspended');
  }
  setAuthCookie(res, user._id);
  res.json({ user });
});

exports.logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});
