/**
 * RESERVATION LIFECYCLE CONTROLLER - Owner: Member 5 - Requirements: 53, 54 (Sprint 2)
 * Mounted at /api/reservation-lifecycle. Rules live in services/reservations/lifecycle.js (contract: docs/sprint2/member5.md §4).
 */
const asyncHandler = require('../utils/asyncHandler');
const lifecycle = require('../services/reservations/lifecycle');

/** GET /api/reservation-lifecycle/mine - Req 53, 54 - ?status=&from=&to=&page=&limit= */
exports.listMine = asyncHandler(async (req, res) => {
  res.json(await lifecycle.listMine(req.user, req.query));
});

/** GET /api/reservation-lifecycle/:id - Req 53 - one reservation for its borrower or lender */
exports.getOne = asyncHandler(async (req, res) => {
  res.json({ reservation: await lifecycle.getOne(req.user, req.params.id) });
});
