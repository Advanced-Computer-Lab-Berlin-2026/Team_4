/** Admin user management — Member 4 — Requirements 7, 22, 28, 29, 39. */
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const Item = require('../models/Item');
const Favorite = require('../models/Favorite');
const HouseholdLink = require('../models/HouseholdLink');
const LenderApplication = require('../models/LenderApplication');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { removeFile } = require('../middleware/upload');

const FIELDS = 'name username email phone address role lenderStatus status suspension createdAt';
const text = (value, field) => {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw ApiError.badRequest(`${field} must be text`);
  return value.trim();
};
const choice = (value, field, choices) => {
  const result = text(value, field);
  if (result && !choices.includes(result)) throw ApiError.badRequest(`Invalid ${field}`);
  return result;
};
const integer = (value, field, fallback, max) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw ApiError.badRequest(`${field} must be an integer between 1 and ${max}`);
  }
  return Number(value);
};
const id = (value) => {
  if (!mongoose.isObjectIdOrHexString(value)) throw ApiError.badRequest('Invalid user ID');
  return new mongoose.Types.ObjectId(value).toHexString();
};

exports.listUsers = asyncHandler(async (req, res) => {
  const q = text(req.query.q, 'Search');
  if (q.length > 100) throw ApiError.badRequest('Search must be at most 100 characters');
  const role = choice(req.query.role, 'role', ['member', 'admin', 'lender']);
  const lenderStatus = choice(req.query.lenderStatus, 'lender status', ['none', 'pending', 'verified', 'rejected']);
  const status = choice(req.query.status, 'status', ['active', 'suspended']);
  const page = integer(req.query.page, 'page', 1, 1000000);
  const limit = integer(req.query.limit, 'limit', 10, 50);
  const query = {};
  if (q) {
    const literal = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = ['name', 'username', 'email'].map(field => ({ [field]: { $regex: literal, $options: 'i' } }));
  }
  if (role) query.role = role === 'lender' ? 'member' : role;
  if (lenderStatus) query.lenderStatus = lenderStatus;
  if (role === 'lender') {
    query.lenderStatus = 'verified';
    if (lenderStatus && lenderStatus !== 'verified') query._id = { $in: [] };
  }
  if (status) query.status = status;
  const [users, total] = await Promise.all([
    User.find(query).select(FIELDS).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(query),
  ]);
  res.json({ success: true, data: users, count: users.length, total, totalPages: Math.max(Math.ceil(total / limit), 1), currentPage: page });
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(id(req.params.id)).select(FIELDS);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, data: user });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  const { status, isSuspended, reason } = req.body || {};
  if (isSuspended !== undefined && typeof isSuspended !== 'boolean') throw ApiError.badRequest('isSuspended must be a boolean');
  const newStatus = status === undefined ? (isSuspended === undefined ? undefined : isSuspended ? 'suspended' : 'active') : status;
  if (!['active', 'suspended'].includes(newStatus) || (isSuspended !== undefined && isSuspended !== (newStatus === 'suspended'))) {
    throw ApiError.badRequest('Provide an active or suspended status without conflicting values');
  }
  const explanation = text(reason, 'Reason');
  if (explanation.length > 1000) throw ApiError.badRequest('Reason must be at most 1000 characters');
  const user = await User.findById(id(req.params.id));
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'admin') throw ApiError.conflict('Administrator accounts cannot be suspended or reinstated here');
  const update = newStatus === 'suspended'
    ? { $set: { status: newStatus, suspension: { reason: explanation, at: new Date(), by: req.user._id } } }
    : { $set: { status: newStatus }, $unset: { suspension: 1 } };
  const updated = await User.findOneAndUpdate({ _id: user._id, role: 'member' }, update, { new: true, runValidators: true }).select(FIELDS);
  if (!updated) throw ApiError.conflict('Account changed. Refresh and try again');
  res.json({ success: true, data: updated });
});

exports.removeUser = asyncHandler(async (req, res) => {
  const userId = id(req.params.id);
  if (String(req.user._id) === userId) throw ApiError.conflict('You cannot remove your own administrator account');
  const session = await mongoose.startSession();
  let documentPaths = [];
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) throw ApiError.notFound('User not found');
      const items = await Item.find({ owner: userId }).select('_id').session(session);
      const application = await LenderApplication.findOne({ user: userId }).session(session);
      documentPaths = application?.documents.map(doc => doc.path) || [];
      // Archive listings to preserve history while removing them from every public catalog route.
      await Item.updateMany({ owner: userId }, { $set: { isArchived: true, archivedAt: new Date() } }, { session });
      await Favorite.deleteMany({ $or: [{ user: userId }, { item: { $in: items.map(item => item._id) } }] }, { session });
      await HouseholdLink.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] }, { session });
      await LenderApplication.deleteMany({ user: userId }, { session });
      await PasswordResetOtp.deleteMany({ user: userId }, { session });
      await User.deleteOne({ _id: userId }, { session });
    });
  } finally { await session.endSession(); }
  // Delete private uploads only after the database transaction commits.
  documentPaths.filter(p => /^private\/lender-docs\/[^/\\]+$/.test(p)).forEach(removeFile);
  res.json({ success: true, message: 'User removed successfully' });
});
