/**
 * CATALOG CONTROLLER - Owner: Member 7 (Public Catalog, Search & Item Details)
 * Requirements: 16, 17, 18, 19, 20, 35
 * Mounted at /api/catalog (see routes/catalog.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination, paginated } = require('../utils/pagination');
const Item = require('../models/Item');
const Category = require('../models/Category');

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
 * GET /api/catalog - Req 16, 17, 18, 35 - public
 * Query: q (name search), category (id or slug), sort, page, limit
 * Returns { items, total, page, limit, pages }; each item matches the shared <ItemCard> shape.
 */
exports.listItems = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = Item.publicFilter();

  // Req 17 - search by name (case-insensitive, regex-escaped so user input can't inject patterns)
  const q = asString(req.query.q).slice(0, 100);
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };

  // Req 18 - category filter (accepts an _id or a slug). Items in inactive categories are never listed.
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
 * Item details + owner NAME only (no email/phone/address) + category.
 * Includes pickup / rules / manual so Member 6's <PickupInfo/> and <ManualViewer/> (wired into the
 * details page) have their data.
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