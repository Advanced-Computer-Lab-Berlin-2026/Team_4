/**
 * RESERVATION LIFECYCLE CONTROLLER - Owner: Member 5 - Requirements: 53, 54, 56-60 (read side) (Sprint 2)
 * Mounted at /api/reservation-lifecycle. Rules live in services/reservations/lifecycle.js (contract: docs/sprint2/member5.md §4).
 */
const asyncHandler = require('../utils/asyncHandler');
const lifecycle = require('../services/reservations/lifecycle');

/** GET /api/reservation-lifecycle/mine - Req 53, 54 - ?status=&from=&to=&page=&limit= */
exports.listMine = asyncHandler(async (req, res) => {
  res.json(await lifecycle.listMine(req.user, req.query));
});

/** GET /api/reservation-lifecycle/lending - Req 56-60 - bookings of my items; + ?item=&needsAction=true */
exports.listLending = asyncHandler(async (req, res) => {
  res.json(await lifecycle.listLending(req.user, req.query));
});

/** GET /api/reservation-lifecycle/lending/items - my items that have bookings (for the item filter) */
exports.lendingItems = asyncHandler(async (req, res) => {
  res.json({ items: await lifecycle.lendingItems(req.user) });
});

/** GET /api/reservation-lifecycle/:id - Req 53 - one reservation for its borrower or lender */
exports.getOne = asyncHandler(async (req, res) => {
  res.json({ reservation: await lifecycle.getOne(req.user, req.params.id) });
});

/** PATCH /api/reservation-lifecycle/:id/approve - Req 56 - the lender approves a pending request (Member 1's confirm) */
exports.approve = asyncHandler(async (req, res) => {
  res.json({ reservation: await lifecycle.decide(req.user, req.params.id, 'approve') });
});

/** PATCH /api/reservation-lifecycle/:id/reject - Req 56 - { reason? } (up to 500 characters, shown to the borrower) */
exports.reject = asyncHandler(async (req, res) => {
  res.json({ reservation: await lifecycle.decide(req.user, req.params.id, 'reject', req.body || {}) });
});
