const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');

const CATEGORIES = ['reservations', 'promotions', 'communityNotices'];

exports.get = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('notificationPrefs');
  if (!user) throw ApiError.notFound('Member not found');
  const preferences = Object.fromEntries(
    CATEGORIES.map((category) => [category, user.notificationPrefs?.[category] !== false])
  );
  res.json({ preferences });
});

exports.update = asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) throw ApiError.badRequest('At least one preference is required');
  const unknown = entries.find(([key]) => !CATEGORIES.includes(key));
  if (unknown) throw ApiError.badRequest(`Unknown notification category: ${unknown[0]}`);
  if (entries.some(([, value]) => typeof value !== 'boolean')) {
    throw ApiError.badRequest('Preference values must be boolean');
  }

  const update = {};
  entries.forEach(([category, enabled]) => {
    update[`notificationPrefs.${category}`] = enabled;
  });
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: update },
    { new: true, runValidators: true }
  ).select('notificationPrefs');
  if (!user) throw ApiError.notFound('Member not found');
  res.json({
    preferences: Object.fromEntries(
      CATEGORIES.map((category) => [category, user.notificationPrefs?.[category] !== false])
    ),
  });
});
