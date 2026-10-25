// Member 1 — Requirement 6. Route middleware enforces admin access.
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');

exports.createAdmin = asyncHandler(async (req, res) => {
  const user = new User({
    username: req.body.username, name: req.body.username,
    role: 'admin', createdBy: req.user._id,
  });
  await user.setPassword(req.body.password);
  await user.save();
  // Keep the creating administrator's current session.
  res.status(201).json({ user });
});
