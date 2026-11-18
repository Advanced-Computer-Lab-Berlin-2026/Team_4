/**
 * CATALOG CONTROLLER - Owner: Member 7 (Public Catalog, Search & Item Details)
 * Sprint 1: 16, 17, 18, 19, 20, 35.  Sprint 2: 43 (calendar data), 44 (date filter), 92 (alternatives).
 * Mounted at /api/catalog (see routes/catalog.routes.js). Contract: docs/sprint2/member7.md
 */
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination, paginated } = require('../utils/pagination');
const Item = require('../models/Item');
const Category = require('../models/Category');
const { parseRange, unavailableItemIds, blockedIntervals, toDay, todayStart } = require('../services/catalog/availabilityBridge');
const { findAlternatives } = require('../services/catalog/alternatives');

const SORTS = {
  newest: '-createdAt',
  oldest: 'createdAt',
  'deposit-asc': 'depositAmount',
  'deposit-desc': '-depositAmount',
  title: 'title',
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asString = (v) => (typeof v === 'string' ? v.trim() : '');

/** Public photo shape: never expose the on-disk path. */
const publicPhotos = (photos = []) => photos.map((p) => ({ _id: p._id, url: p.url }));

/**
 * GET /api/catalog - Req 16, 17, 18, 35, 44 - public
 * Query: q (name), category (id or slug), availableFrom + availableTo (YYYY-MM-DD, Req 44), sort, page, limit
 * Returns { items, total, page, limit, pages }; each item matches the shared <ItemCard> shape.
 */
exports.listItems = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = Item.publicFilter();

  const q = asString(req.query.q).slice(0, 100);
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };

  const categoryParam = asString(req.query.category);
  if (categoryParam) {
    const catQuery = mongoose.isValidObjectId(categoryParam)
      ? { _id: categoryParam, isActive: true }
      : { slug: categoryParam.toLowerCase(), isActive: true };
    const cat = await Category.findOne(catQuery).select('_id');
    if (!cat) return res.json(paginated([], 0, { page, limit }));
    filter.category = cat._id;
  } else {
    const activeIds = await Category.find({ isActive: true }).distinct('_id');
    filter.category = { $in: activeIds };
  }

  // Req 44 - only items free for the whole date range (same overlap rule as the calendar and waitlists)
  const availableFrom = asString(req.query.availableFrom);
  const availableTo = asString(req.query.availableTo);
  if (availableFrom || availableTo) {
    const parsed = parseRange(availableFrom, availableTo, { maxDays: 365 });
    if (parsed.error) throw ApiError.badRequest(parsed.error);
    const blocked = await unavailableItemIds(parsed.range, { exceptUserId: req.user?._id });
    if (blocked.length) filter._id = { $nin: blocked };
  }

  const sort = SORTS[asString(req.query.sort)] || SORTS.newest;

  const [docs, total] = await Promise.all([
    Item.find(filter)
      .select('title photos category depositAmount owner createdAt')
      .populate('category', 'name slug icon')
      .populate('owner', 'name')
      .sort(`${sort} _id`)
      .skip(skip)
      .limit(limit)
      .lean(),
    Item.countDocuments(filter),
  ]);

  const items = docs.map((it) => ({ ...it, photos: publicPhotos(it.photos) }));
  res.json(paginated(items, total, { page, limit }));
});

/**
 * GET /api/catalog/:id - Req 19, 20, 35 - public
 * Item details + owner name/id only (no contact details) + category.
 */
exports.getItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Item not found');

  const doc = await Item.findOne(Item.publicFilter({ _id: id }))
    .select('title description conditionNotes depositAmount photos category owner pickup rules manual createdAt')
    .populate({ path: 'category', select: 'name slug icon', match: { isActive: true } })
    .populate('owner', 'name')
    .lean();
  if (!doc || !doc.category) throw ApiError.notFound('Item not found');

  const item = { ...doc, photos: publicPhotos(doc.photos) };
  if (item.manual) {
    const { url, originalName, mimeType, uploadedAt } = item.manual; // drop disk path
    item.manual = url ? { url, originalName, mimeType, uploadedAt } : undefined;
  }
  res.json({ item });
});

/**
 * GET /api/catalog/:id/availability - Req 43 - public
 * Query: from, to (YYYY-MM-DD, window [from, to)); default: today .. +60 days.
 * Returns { itemId, from, to, booked: [{ start, end, type: 'booked' | 'held' }] } - dates only, never who booked.
 */
exports.getAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id) || !(await Item.exists(Item.publicFilter({ _id: id })))) {
    throw ApiError.notFound('Item not found');
  }
  let from = asString(req.query.from);
  let to = asString(req.query.to);
  if (!from && !to) {
    from = toDay(todayStart());
    to = toDay(new Date(todayStart().getTime() + 60 * 86400000));
  }
  const parsed = parseRange(from, to, { allowPast: true });
  if (parsed.error) throw ApiError.badRequest(parsed.error);

  const booked = await blockedIntervals(id, parsed.range, { exceptUserId: req.user?._id });
  res.json({ itemId: id, from, to, booked });
});

/**
 * GET /api/catalog/:id/alternatives - Req 92 - public
 * Query: start, end (YYYY-MM-DD, required), limit (1-12, default 6).
 * Similar items (category + lender tags) that are free for those dates. Same shape as the list endpoint.
 */
exports.getAlternatives = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Item not found');
  const parsed = parseRange(asString(req.query.start), asString(req.query.end), { maxDays: 90 });
  if (parsed.error) throw ApiError.badRequest(parsed.error);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 12);

  const items = await findAlternatives(id, parsed.range, { limit, userId: req.user?._id });
  if (!items) throw ApiError.notFound('Item not found');
  res.json({ items, total: items.length });
});
