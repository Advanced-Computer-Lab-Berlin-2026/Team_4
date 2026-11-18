const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Notification = require('../models/Notification');
const { parsePagination, paginated } = require('../utils/pagination');

exports.list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const filter = { user: req.user._id };
  if (req.query.unreadOnly === 'true') filter.readAt = null;
  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Notification.countDocuments(filter),
  ]);
  res.json(paginated(items, total, pagination));
});

exports.unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, readAt: null });
  res.json({ count });
});

exports.markRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.badRequest('Invalid notification id');
  const owned = { _id: req.params.id, user: req.user._id };
  const updated = await Notification.findOneAndUpdate(
    { ...owned, readAt: null }, { $set: { readAt: new Date() } }, { new: true },
  );
  const notification = updated || await Notification.findOne(owned);
  if (!notification) throw ApiError.notFound('Notification not found');
  res.json({ notification });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ modifiedCount: result.modifiedCount });
});
