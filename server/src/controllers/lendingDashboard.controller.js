/**
 * LENDING DASHBOARD CONTROLLER - Owner: Member 5 - Requirement: 106 (Sprint 2)
 * Mounted at /api/lending-dashboard. Figures are worked out in services/reservations/lendingDashboard.js (§7 of member5.md).
 */
const asyncHandler = require('../utils/asyncHandler');
const dashboard = require('../services/reservations/lendingDashboard');

/** GET /api/lending-dashboard - Req 106 - ?period=all|30d */
exports.getDashboard = asyncHandler(async (req, res) => {
  res.json(await dashboard.getDashboard(req.user, req.query));
});
