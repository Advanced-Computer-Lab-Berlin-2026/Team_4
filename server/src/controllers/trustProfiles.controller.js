/**
 * TRUST PROFILES CONTROLLER - Owner: Member 3 (Sprint 2: damage evidence, disputes, reviews and trust)
 * Requirements: 91, 98
 * Mounted at /api/trust-profiles (see routes/trustProfiles.routes.js). Contract: docs/sprint2/member3.md §5.3
 */
const asyncHandler = require('../utils/asyncHandler');
const trust = require('../services/reviews/trust');

/**
 * GET /api/trust-profiles/me - Req 91 - member
 * The logged-in user's own trust profile.
 */
exports.getMyTrustProfile = asyncHandler(async (req, res) => {
  res.json({ profile: trust.toTrustSummary(req.user) });
});

/**
 * GET /api/trust-profiles/:userId - Req 91 - public
 * Public-safe summary (score, stats, name). Also used by TrustSummary on the item details page, which guests can open.
 */
exports.getTrustProfile = asyncHandler(async (req, res) => {
  res.json({ profile: await trust.getTrustSummary(req.params.userId) });
});

/**
 * POST /api/trust-profiles/:userId/recalculate - Req 98 - admin
 * Repair tool: recalculate a user's score from their full history.
 */
exports.recalculate = asyncHandler(async (req, res) => {
  await trust.recalculateTrust(req.params.userId, { eventKey: `admin:${req.user._id}:recalculate` });
  res.json({ profile: await trust.getTrustSummary(req.params.userId) });
});
