const asyncHandler = require('../utils/asyncHandler');
const commands = require('../services/reservations/reservationCommands');
const cancellation = require('../services/reservations/cancellation');
const { getAvailability, normalizeRange } = require('../services/reservations/availability');
const { Item } = require('../models');
const ApiError = require('../utils/ApiError');

exports.availability = asyncHandler(async (req, res) => {
  const range = normalizeRange(req.query);
  const itemId = req.params.itemId;
  if (!await Item.exists(Item.publicFilter({ _id: itemId }))) throw ApiError.notFound('This listing is unavailable');
  res.json(await getAvailability(itemId, range));
});

exports.list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw ApiError.badRequest('Invalid page');
  res.json(await commands.listReservations(req.user._id, page));
});

exports.get = asyncHandler(async (req, res) => {
  const reservation = await commands.getParticipantReservation(req.user._id, req.params.id);
  await reservation.populate('item', 'title');
  res.json({ reservation: commands.reservationView(reservation) });
});

exports.cancel = asyncHandler(async (req, res) => {
  const reservation = await cancellation.cancel({
    actorId: req.user._id, reservationId: req.params.id, reason: req.body?.reason,
  });
  await reservation.populate('item', 'title');
  res.json({ reservation: commands.reservationView(reservation) });
});
