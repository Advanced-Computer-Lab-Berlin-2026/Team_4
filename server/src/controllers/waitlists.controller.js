/**
 * WAITLISTS CONTROLLER - Owner: Member 7 (Availability discovery, alternatives & waitlists)
 * Requirements: 65, 66 (67 = promotion, in services/waitlists/waitlist.js)
 * Mounted at /api/waitlists (see routes/waitlists.routes.js). Contract: docs/sprint2/member7.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parseRange } = require('../services/catalog/availabilityBridge');
const waitlist = require('../services/waitlists/waitlist');

/** POST /api/waitlists - Req 65 - member. body: { itemId, startDate, endDate } (YYYY-MM-DD) */
exports.joinWaitlist = asyncHandler(async (req, res) => {
  const parsed = parseRange(req.body.startDate, req.body.endDate, { maxDays: 90 });
  if (parsed.error) throw ApiError.badRequest(parsed.error);
  const entry = await waitlist.joinWaitlist(req.user, req.body.itemId, parsed.range);
  res.status(201).json({ entry });
});

/** GET /api/waitlists/mine - Req 66 - member. Optional ?item=<id>. */
exports.listMyWaitlists = asyncHandler(async (req, res) => {
  const items = await waitlist.listMine(req.user._id, { itemId: req.query.item });
  res.json({ items, total: items.length });
});

/** DELETE /api/waitlists/:id - Req 66 - member (owner of the entry only) */
exports.leaveWaitlist = asyncHandler(async (req, res) => {
  const entry = await waitlist.leaveWaitlist(req.user, req.params.id);
  res.json({ entry });
});
