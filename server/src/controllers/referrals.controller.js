const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginated } = require('../utils/pagination');
const { CURRENCY } = require('../config/constants');
const Referral = require('../models/Referral');
const { getMyReferrals, captureReferral, recordReferralShare } = require('../services/referrals/referral');

exports.mine = asyncHandler(async (req, res) => {
  res.json(await getMyReferrals(req.user._id));
});

exports.capture = asyncHandler(async (req, res) => {
  const referral = await captureReferral({ userId: req.user._id, code: req.body.code });
  res.status(201).json({ referral });
});

exports.share = asyncHandler(async (req, res) => {
  await recordReferralShare(req.user._id, req.body.shareKey);
  res.sendStatus(204);
});

exports.report = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const [items, total, totals] = await Promise.all([
    Referral.find().populate('referrer', 'name username').populate('referee', 'name username')
      .select('-shareKey -code').sort({ createdAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Referral.countDocuments(),
    Referral.aggregate([
      {
        $group: {
          _id: null,
          referralsSent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          signups: { $sum: { $cond: [{ $in: ['$status', ['registered', 'converted']] }, 1, 0] } },
          conversions: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
          creditsIssuedMinor: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, { $ifNull: ['$creditAmountMinor', { $multiply: [{ $ifNull: ['$creditAmount', 0] }, 100] }] }, 0] } },
        },
      },
    ]),
  ]);
  res.json({
    ...paginated(items.map((item) => ({ ...item, creditAmountMinor: item.creditAmountMinor ?? Math.round((item.creditAmount || 0) * 100), currency: CURRENCY })), total, pagination),
    totals: {
      referralsSent: totals[0]?.referralsSent || 0,
      signups: totals[0]?.signups || 0,
      conversions: totals[0]?.conversions || 0,
      creditsIssuedMinor: totals[0]?.creditsIssuedMinor || 0,
      currency: CURRENCY,
    },
  });
});
