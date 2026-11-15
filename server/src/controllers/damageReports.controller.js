/**
 * DAMAGE REPORTS CONTROLLER - Owner: Member 3 (Sprint 2: damage evidence, disputes, reviews and trust)
 * Requirements: 61, 62, 63, 64, 80
 * Mounted at /api/damage-reports (see routes/damageReports.routes.js). Contract: docs/sprint2/member3.md §2
 */
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginated } = require('../utils/pagination');
const damage = require('../services/damage/damage');

/**
 * POST /api/damage-reports - Req 61 - verified lender (of that reservation)
 * Body: { reservationId, description }
 */
exports.createReport = asyncHandler(async (req, res) => {
  const report = await damage.createReport(req.user, { reservationId: req.body.reservationId, description: req.body.description });
  res.status(201).json({ report });
});

/**
 * GET /api/damage-reports/mine - Req 61, 63 - member
 * ?role=lender|borrower (omit for both), ?page, ?limit
 */
exports.listMyReports = asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 10 });
  const { items, total } = await damage.listMyReports(req.user._id, { role: req.query.role, ...pg });
  res.json(paginated(items, total, pg));
});

/**
 * GET /api/damage-reports - Req 62, 64 - admin
 * Work queue. ?status=open|decided|disputed|resolved, ?page, ?limit
 */
exports.listReports = asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 20 });
  const { items, total } = await damage.listReports({ status: req.query.status, ...pg });
  res.json(paginated(items, total, pg));
});

/**
 * GET /api/damage-reports/:id - Req 62, 63, 64, 80 - participant or admin
 * One report with reservation summary and before/after photo metadata.
 */
exports.getReport = asyncHandler(async (req, res) => {
  res.json({ report: await damage.getReport(req.user, req.params.id) });
});

/**
 * PATCH /api/damage-reports/:id/decision - Req 62 - admin
 * Body: { forfeitAmount, note }
 */
exports.decideReport = asyncHandler(async (req, res) => {
  const { forfeitAmount, note } = req.body;
  res.json({ report: await damage.decideReport(req.user, req.params.id, { forfeitAmount, note }) });
});

/**
 * POST /api/damage-reports/:id/dispute - Req 63 - borrower
 * Body: { reason }
 */
exports.disputeReport = asyncHandler(async (req, res) => {
  res.json({ report: await damage.disputeReport(req.user, req.params.id, { reason: req.body.reason }) });
});

/**
 * PATCH /api/damage-reports/:id/resolution - Req 64 - admin
 * Body: { finalForfeitAmount, note }
 */
exports.resolveReport = asyncHandler(async (req, res) => {
  const { finalForfeitAmount, note } = req.body;
  res.json({ report: await damage.resolveReport(req.user, req.params.id, { finalForfeitAmount, note }) });
});
