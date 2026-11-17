const asyncHandler = require('../utils/asyncHandler');
const delivery = require('../services/delivery/delivery');

exports.getItem = asyncHandler(async (req, res) => {
  res.json({ item: await delivery.getItemSettings(req.params.itemId, req.user._id) });
});

exports.setItem = asyncHandler(async (req, res) => {
  res.json({ item: await delivery.setItemSettings(req.params.itemId, req.user, req.body) });
});

exports.listReservations = asyncHandler(async (req, res) => {
  res.json(await delivery.listTracking(req.user, Number(req.query.page ?? 1)));
});

exports.getReservation = asyncHandler(async (req, res) => {
  res.json({ reservation: await delivery.getTracking(req.params.id, req.user) });
});

exports.setReservation = asyncHandler(async (req, res) => {
  res.json({ reservation: await delivery.setTracking(req.params.id, req.user, req.body?.deliveryStatus) });
});
