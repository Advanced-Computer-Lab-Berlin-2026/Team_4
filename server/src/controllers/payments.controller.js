/**
 * PAYMENTS CONTROLLER - Owner: Member 2. Mounted at /api/payments.
 * Requirements: 78 (view late fees). Later steps add the policy, card-payment status, refunds.
 */
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginated } = require('../utils/pagination');
const lateFee = require('../services/payments/lateFee');

/** GET /api/payments/late-fees?page&limit - member - Req 78: own late fees + total still owed */
exports.listMyLateFees = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const [{ items, total }, outstandingTotalMinor] = await Promise.all([
    lateFee.listLateFees(req.user._id, pagination),
    lateFee.outstandingTotalMinor(req.user._id),
  ]);
  res.json({ ...paginated(items, total, pagination), outstandingTotalMinor });
});
