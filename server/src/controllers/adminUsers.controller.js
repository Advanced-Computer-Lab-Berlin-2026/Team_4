// server/src/controllers/adminUsers.controller.js
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');

/**
 * GET /api/admin-users - Req 28, 29 - admin
 * List/search users (q=name, role, lenderStatus, status, page)
 */
exports.listUsers = asyncHandler(async (req, res) => {
  const { q, role, lenderStatus, status, page = 1, limit = 10 } = req.query;
  const query = {};

  if (q) {
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { username: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } }
    ];
  }
  if (role) query.role = role;
  if (lenderStatus) query.lenderStatus = lenderStatus;
  if (status) query.status = status;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

  const total = await User.countDocuments(query);

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
    currentPage: pageNum,
    data: users,
  });
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) throw ApiError.notFound('User not found');
  res.status(200).json({ success: true, data: user });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  const { status, isSuspended } = req.body;
  const newStatus = typeof isSuspended === 'boolean' ? (isSuspended ? 'suspended' : 'active') : status;

  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  user.status = newStatus;
  await user.save();
  res.status(200).json({ success: true, data: user });
});

exports.removeUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  await user.deleteOne();
  res.status(200).json({ success: true, message: 'User removed successfully' });
});