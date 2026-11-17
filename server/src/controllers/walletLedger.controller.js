/**
 * WALLET LEDGER CONTROLLER - Owner: Member 2. Mounted at /api/wallet-ledger.
 * A member sees only their own wallet history (every credit and debit with the balance after it).
 */
const asyncHandler = require('../utils/asyncHandler');
const WalletTransaction = require('../models/WalletTransaction');
const { parsePagination, paginated } = require('../utils/pagination');

/** GET /api/wallet-ledger?page&limit&type - member - own ledger, newest first */
exports.listMyLedger = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const filter = { user: req.user._id }; // ALWAYS scoped to the logged-in user
  if (req.query.type) filter.type = req.query.type;

  const [items, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .select('type amount amountMinor balanceAfter balanceAfterMinor currency reservation reference note createdAt')
      .lean(),
    WalletTransaction.countDocuments(filter),
  ]);
  res.json(paginated(items, total, pagination));
});
