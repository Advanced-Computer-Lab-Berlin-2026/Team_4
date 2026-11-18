/**
 * ALTERNATIVES - Owner: Member 7 (Req 92)
 * Similar items that are free for the requested dates. Matched by category + lender-set tags
 * (Item.tags, added by Member 5's editor). No image recognition. Public visibility rules always apply.
 */
const Item = require('../../models/Item');
const { findPublicItem, unavailableItemIds } = require('./availabilityBridge');

/** Higher = better: each shared tag counts 10, closeness of deposit breaks ties (0..1). */
function score(source, candidate) {
  const sourceTags = new Set(source.tags || []);
  const shared = [...new Set(candidate.tags || [])].filter((t) => sourceTags.has(t)).length;
  const maxDeposit = Math.max(source.depositAmount || 0, candidate.depositAmount || 0, 1);
  const closeness = 1 - Math.abs((source.depositAmount || 0) - (candidate.depositAmount || 0)) / maxDeposit;
  return shared * 10 + closeness;
}

/** Pure ranking step (unit-tested). */
function rankAlternatives(source, candidates, limit = 6) {
  return candidates
    .map((c) => ({ c, s: score(source, c) }))
    .sort((a, b) => b.s - a.s || new Date(b.c.createdAt) - new Date(a.c.createdAt) || String(a.c._id).localeCompare(String(b.c._id)))
    .slice(0, limit)
    .map((x) => x.c);
}

/** -> array of ItemCard-shaped items, or null when the source item is not publicly visible. */
async function findAlternatives(itemId, range, { limit = 6 } = {}) {
  const source = await findPublicItem(itemId, 'category tags depositAmount');
  if (!source) return null;

  const blocked = await unavailableItemIds(range);
  const exclude = [source._id, ...blocked];
  const base = { category: source.category, _id: { $nin: exclude } };
  const select = 'title photos category depositAmount owner tags createdAt';

  const candidates = await Item.find(Item.publicFilter(base)).select(select).lean();
  const top = rankAlternatives(source, candidates, limit);

  const populated = await Item.populate(top, [
    { path: 'category', select: 'name slug icon' },
    { path: 'owner', select: 'name' },
  ]);
  return populated.map(({ tags, photos = [], ...rest }) => ({
    ...rest,
    photos: photos.map((p) => ({ _id: p._id, url: p.url })),
  }));
}

module.exports = { findAlternatives, rankAlternatives, score };
