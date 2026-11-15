const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Referral = require('../../models/Referral');
const Reservation = require('../../models/Reservation');
const { CURRENCY } = require('../../config/constants');

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

async function captureReferral({ userId, code }) {
  if (!code || typeof code !== 'string') throw ApiError.badRequest('Referral code is required');
  const member = await User.findById(userId).select('_id referredBy role');
  if (!member || member.role !== 'member') throw ApiError.forbidden('Only members can use a referral code');

  const referrer = await User.findOne({ referralCode: code.trim().toUpperCase() }).select('_id referralCode');
  if (!referrer) throw ApiError.notFound('Referral code not found');
  if (String(referrer._id) === String(member._id)) throw ApiError.badRequest('You cannot refer yourself');
  if (member.referredBy) throw ApiError.conflict('This account already has a referrer');
  if (await Reservation.exists({ borrower: member._id, status: 'completed' })) {
    throw ApiError.badRequest('Referral rewards are only available before your first completed reservation');
  }

  try {
    const referral = await Referral.create({
      referrer: referrer._id,
      referee: member._id,
      code: referrer.referralCode,
      status: 'registered',
    });
    const linked = await User.updateOne(
      { _id: member._id, $or: [{ referredBy: { $exists: false } }, { referredBy: null }] },
      { $set: { referredBy: referrer._id } }
    );
    if (!linked.modifiedCount) {
      await Referral.deleteOne({ _id: referral._id });
      throw ApiError.conflict('This account already has a referrer');
    }
    return referral;
  } catch (error) {
    if (error.code === 11000) throw ApiError.conflict('This account already has a referrer');
    throw error;
  }
}

async function rewardForFirstCompletion(userId, reservationId) {
  if (!mongoose.isValidObjectId(userId)) throw new TypeError('A valid member id is required');
  const firstCompletion = await Reservation.findOne({ borrower: userId, status: 'completed' })
    .sort({ updatedAt: 1, _id: 1 })
    .select('_id');
  if (!firstCompletion || (reservationId && String(firstCompletion._id) !== String(reservationId))) return null;

  const referral = await Referral.findOne({ referee: userId, status: 'registered' });
  if (!referral) return null;
  if (String(referral.referrer) === String(referral.referee)) {
    throw new Error(`Self-referral detected for referral ${referral._id}`);
  }

  const creditReferral = getWalletCreditService().creditReferral;
  await creditReferral({
    userId: referral.referrer,
    amountMinor: REWARD_MINOR,
    currency: CURRENCY,
    reference: `referral:${referral._id}`,
    idempotencyKey: `referral:${referral._id}:first-completion`,
  });

  return Referral.findOneAndUpdate(
    { _id: referral._id, status: 'registered' },
    {
      $set: {
        status: 'converted',
        creditAmount: REWARD_MINOR / 100,
        creditAmountMinor: REWARD_MINOR,
        convertedAt: new Date(),
      },
    },
    { new: true }
  );
}

async function getMyReferrals(userId) {
  const referralCode = await ensureReferralCode(userId);
  const items = await Referral.find({ referrer: userId }).populate('referee', 'name username').sort({ createdAt: -1 });
  const converted = items.filter((item) => item.status === 'converted').length;
  const totalCreditsMinor = items.reduce((sum, item) => sum + (item.creditAmountMinor || 0), 0);
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
  rewardForFirstCompletion,
  getMyReferrals,
  setWalletCreditService,
};
