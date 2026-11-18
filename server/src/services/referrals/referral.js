const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Referral = require('../../models/Referral');
const Reservation = require('../../models/Reservation');
const { CURRENCY } = require('../../config/constants');
const { bookingKeys, transactBooking } = require('../reservations/bookingLock');

const REWARD_MINOR = 10000;
let walletCreditService;

function setWalletCreditService(service) {
  walletCreditService = service;
}

function getWalletCreditService() {
  if (walletCreditService) return walletCreditService;
  let servicePath;
  try {
    servicePath = require.resolve('../payments/wallet');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error('Referral wallet credit service is not configured; expected services/payments/wallet.js');
  }
  const service = require(servicePath);
  if (typeof service.creditReferral !== 'function') {
    throw new Error('Wallet service must export creditReferral()');
  }
  return service;
}

async function ensureReferralCode(userId) {
  const code = crypto.randomBytes(8).toString('hex').toUpperCase();
  const user = await User.findOneAndUpdate(
    { _id: userId, $or: [{ referralCode: { $exists: false } }, { referralCode: null }] },
    { $set: { referralCode: code } },
    { new: true }
  ).select('_id referralCode');
  if (user) return user.referralCode;

  const existing = await User.findById(userId).select('_id referralCode');
  if (!existing) throw ApiError.notFound('Member not found');
  if (existing.referralCode) return existing.referralCode;

  const retry = await User.findOneAndUpdate(
    { _id: userId, referralCode: { $exists: false } },
    { $set: { referralCode: code } },
    { new: true }
  ).select('_id referralCode');
  if (retry) return retry.referralCode;
  const raced = await User.findById(userId).select('referralCode');
  if (!raced?.referralCode) throw new Error('Unable to allocate a unique referral code');
  return raced.referralCode;
}

// The same borrower lock protects completion and capture from racing.
async function captureReferral({ userId, code }) {
  if (typeof code !== 'string' || !code.trim()) throw ApiError.badRequest('Referral code is required');
  return transactBooking(bookingKeys([], userId), async (session) => {
    const member = await User.findOne({ _id: userId, role: 'member', status: 'active' }).select('referredBy').session(session);
    if (!member) throw ApiError.forbidden('Only active members can use a referral code');

    const referrer = await User.findOne({
      referralCode: code.trim().toUpperCase(), role: 'member', status: 'active',
    }).select('referralCode').session(session);
    if (!referrer) throw ApiError.notFound('Referral code not found');
    if (referrer._id.equals(member._id)) throw ApiError.badRequest('You cannot refer yourself');
    if (member.referredBy || await Referral.exists({ referee: member._id }).session(session)) {
      throw ApiError.conflict('This account already has a referrer');
    }
    if (await Reservation.exists({ borrower: member._id, status: 'completed' }).session(session)) {
      throw ApiError.badRequest('Referral rewards are only available before your first completed reservation');
    }

    const [referral] = await Referral.create([{
      referrer: referrer._id, referee: member._id, code: referrer.referralCode, status: 'registered',
    }], { session });
    await User.updateOne({ _id: member._id }, { $set: { referredBy: referrer._id } }, { session });
    return referral;
  });
}

async function recordReferralShare(userId, shareKey) {
  const code = await ensureReferralCode(userId);
  const lookup = { referrer: userId, shareKey };
  await Referral.updateOne(lookup, { $setOnInsert: { code, status: 'sent' } }, { upsert: true });
}

async function rewardForFirstCompletion(userId, reservationId) {
  if (!mongoose.isValidObjectId(userId)) throw new TypeError('A valid member id is required');
  return transactBooking(bookingKeys([], userId), async (session) => {
    const referral = await Referral.findOne({ referee: userId, status: 'registered' }).session(session);
    if (!referral) return null;
    if (referral.referrer.equals(referral.referee)) {
      throw new Error(`Self-referral detected for referral ${referral._id}`);
    }
    const [firstCompletion] = await Reservation.aggregate([
      {
        $match: {
          borrower: new mongoose.Types.ObjectId(userId),
          status: 'completed',
          $or: [{ completedAt: { $type: 'date' } }, { returnedAt: { $type: 'date' } }],
        },
      },
      { $addFields: { referralCompletionDate: { $ifNull: ['$completedAt', '$returnedAt'] } } },
      { $sort: { referralCompletionDate: 1, _id: 1 } },
      { $limit: 1 },
      { $project: { _id: 1 } },
    ]).session(session);
    if (!firstCompletion || (reservationId && String(firstCompletion._id) !== String(reservationId))) return null;

    const creditReferral = getWalletCreditService().creditReferral;
    await creditReferral({
      userId: referral.referrer, amountMinor: REWARD_MINOR, currency: CURRENCY,
      reference: `referral:${referral._id}`, idempotencyKey: `referral:${referral._id}:first-completion`,
    }, session);
    referral.set({ status: 'converted', creditAmount: REWARD_MINOR / 100, creditAmountMinor: REWARD_MINOR, convertedAt: new Date() });
    return referral.save({ session });
  });
}

async function getMyReferrals(userId) {
  const referralCode = await ensureReferralCode(userId);
  const items = await Referral.find({ referrer: userId, status: { $in: ['registered', 'converted'] } }).populate('referee', 'name username').sort({ createdAt: -1 });
  const converted = items.filter((item) => item.status === 'converted').length;
  const totalCreditsMinor = items.reduce((sum, item) => sum + (item.creditAmountMinor || Math.round((item.creditAmount || 0) * 100)), 0);
  return {
    referralCode,
    referralLink: `/register?ref=${encodeURIComponent(referralCode)}`,
    items,
    total: items.length,
    converted,
    totalCreditsMinor,
    currency: CURRENCY,
  };
}

module.exports = {
  REWARD_MINOR,
  ensureReferralCode,
  captureReferral,
  recordReferralShare,
  rewardForFirstCompletion,
  getMyReferrals,
  setWalletCreditService,
};
