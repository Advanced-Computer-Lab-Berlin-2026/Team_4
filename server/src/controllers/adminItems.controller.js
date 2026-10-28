/**
 * ADMINITEMS CONTROLLER - Owner: Member 9 (Favorites, Notices & Category/Admin Listing Views)
 * Requirements: 23
 * Mounted at /api/admin-items (see routes/adminItems.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const Item = require('../models/Item');
const { parsePagination, paginated } = require('../utils/pagination');

/**
 * GET /api/admin-items - Req 23 - admin
 * All item listings on the platform, including archived and moderated items (paginated)
 */
exports.listAllItems = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12, maxLimit: 50 });
  const [items, total] = await Promise.all([
    Item.find()
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('owner', 'name username')
      .populate('category', 'name slug'),
    Item.countDocuments(),
  ]);

  res.json(paginated(items, total, pagination));
});
