/**
 * MEMBERSHIPS CONTROLLER - Owner: Member 8
 * Requirements: 83, 84, 85, 86, 87, 108
 * Mounted at /api/memberships (see routes/memberships.routes.js). Contract: docs/sprint2/member8.md
 */
const asyncHandler = require('../utils/asyncHandler');
const membership = require('../services/membership/membership');

/** GET /api/memberships/tiers - Req 83 - public */
exports.listTiers = asyncHandler(async (req, res) => {
  const items = await membership.listTiers();
  res.json({ items, total: items.length, paymentMethods: membership.availablePaymentMethods() });
});

/** GET /api/memberships/me - Req 86 - member */
exports.getMine = asyncHandler(async (req, res) => {
  res.json(await membership.getMyMembership(req.user._id));
});

/** POST /api/memberships/subscribe - Req 84, 85 - member */
exports.subscribe = asyncHandler(async (req, res) => {
  const result = await membership.subscribe({
    userId: req.user._id,
    tierId: req.body.tierId,
    method: req.body.method,
    operationKey: req.body.operationKey,
  });
  res.status(result.payment ? 202 : 200).json(result);
});

/** POST /api/memberships/cancel - Req 87 - member */
exports.cancel = asyncHandler(async (req, res) => {
  res.json(await membership.cancel(req.user._id));
});

/** GET /api/memberships/report - Req 108 - admin */
exports.report = asyncHandler(async (req, res) => {
  res.json(await membership.distributionReport());
});
