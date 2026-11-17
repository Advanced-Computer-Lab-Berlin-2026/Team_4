/**
 * BORROW LISTS CONTROLLER - Owner: Member 5 - Requirements: 46, 47, 48
 * Mounted at /api/borrow-lists. All rules are in services/borrow/borrowList.js (contract: docs/sprint2/member5.md §3).
 */
const asyncHandler = require('../utils/asyncHandler');
const borrowList = require('../services/borrow/borrowList');

/** GET /api/borrow-lists/mine - Req 46-48 - my list (empty if I have none yet) */
exports.getMyList = asyncHandler(async (req, res) => {
  res.json({ borrowList: await borrowList.getList(req.user._id) });
});

/** POST /api/borrow-lists/mine/entries - Req 46 - { itemId, startDate, endDate } */
exports.addEntry = asyncHandler(async (req, res) => {
  const { itemId, startDate, endDate } = req.body;
  res.status(201).json({ borrowList: await borrowList.addEntry(req.user, { itemId, startDate, endDate }) });
});

/** PATCH /api/borrow-lists/mine/entries/:entryId - Req 48 - { startDate, endDate } */
exports.updateEntryDates = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;
  res.json({ borrowList: await borrowList.updateEntryDates(req.user, req.params.entryId, { startDate, endDate }) });
});

/** DELETE /api/borrow-lists/mine/entries/:entryId - Req 47 */
exports.removeEntry = asyncHandler(async (req, res) => {
  res.json({ borrowList: await borrowList.removeEntry(req.user, req.params.entryId) });
});
