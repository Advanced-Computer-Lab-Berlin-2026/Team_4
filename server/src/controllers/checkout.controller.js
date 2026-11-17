const asyncHandler = require('../utils/asyncHandler');
const checkout = require('../services/reservations/checkout');

exports.preview = asyncHandler(async (req, res) => {
  res.json({ quote: await checkout.preview(req.user._id, req.body || {}) });
});

exports.begin = asyncHandler(async (req, res) => {
  const result = await checkout.begin(req.user._id, req.body || {});
  res.status(result.status === 'awaiting_payment' || result.status === 'refund_due' ? 202 : 200).json({ checkout: result });
});

exports.status = asyncHandler(async (req, res) => {
  res.json({ checkout: await checkout.status(req.user._id, req.params.id) });
});
