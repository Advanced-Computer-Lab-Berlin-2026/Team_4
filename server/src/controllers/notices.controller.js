/**
 * NOTICES CONTROLLER - Owner: Member 9 (Favorites, Notices & Category/Admin Listing Views)
 * Requirements: 41, 42
 * Mounted at /api/notices (see routes/notices.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const Notice = require('../models/Notice');

/**
 * GET /api/notices - Req 42 - any logged-in user
 * Notice board (pinned first, then newest first)
 */
exports.listNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find()
    .sort({ pinned: -1, createdAt: -1 })
    .populate('postedBy', 'name username');
  res.json({ notices });
});

/**
 * POST /api/notices - Req 41 - admin
 * Post a community notice
 */
exports.createNotice = asyncHandler(async (req, res) => {
  const { title, body, pinned = false } = req.body;
  const notice = await Notice.create({
    title,
    body,
    pinned,
    postedBy: req.user._id,
  });
  await notice.populate('postedBy', 'name username');

  res.status(201).json({ notice });
});
