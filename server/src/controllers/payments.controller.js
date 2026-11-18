/**
 * PAYMENTS CONTROLLER - Owner: Member 2. Mounted at /api/payments.
 * Requirements: 78 (view late fees), 77/81 (policy shown before payment).
 */
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginated } = require('../utils/pagination');
const lateFee = require('../services/payments/lateFee');
const policy = require('../services/payments/config');
const { CURRENCY } = require('../config/constants');

/** GET /api/payments/policy - public - refund and late-fee rules, shown before paying (Req 77, 81) */
exports.getPolicy = (req, res) => {
  res.json({ policy: { currency: CURRENCY, ...policy } });
};

/** GET /api/payments/late-fees?page&limit - member - Req 78: own late fees + total still owed */
exports.listMyLateFees = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const [{ items, total }, outstandingTotalMinor] = await Promise.all([
    lateFee.listLateFees(req.user._id, pagination),
    lateFee.outstandingTotalMinor(req.user._id),
  ]);
  res.json({ ...paginated(items, total, pagination), outstandingTotalMinor });
});
