/**
 * ALTERNATIVES - Owner: Member 7 (Req 92)
 * Similar items that are free for the requested dates. Matched by category + lender-set tags
 * (Item.tags, added by Member 5's editor). No image recognition. Public visibility rules always apply.
 */
const Item = require('../../models/Item');
const { unavailableItemIds } = require('./availabilityBridge');

const CANDIDATE_CAP = 100;

/** Higher = better: each shared tag counts 10, closeness of deposit breaks ties (0..1). */
function score(source, candidate) {
  const sourceTags = new Set(source.tags || []);
  const shared = (candidate.tags || []).filter((t) => sourceTags.has(t)).length;
  const maxDeposit = Math.max(source.depositAmount || 0, candidate.depositAmount || 0, 1);
  const closeness = 1 - Math.abs((source.depositAmount || 0) - (candidate.depositAmount || 0)) / maxDeposit;
  return shared * 10 + closeness;
}

/** Pure ranking step (unit-tested). */
function rankAlternatives(source, candidates, limit = 6) {
  return candidates
    .map((c) => ({ c, s: score(source, c) }))
    .sort((a, b) => b.s - a.s || new Date(b.c.createdAt) - new Date(a.c.createdAt))
    .slice(0, limit)
    .map((x) => x.c);
}

/** -> array of ItemCard-shaped items, or null when the source item is not publicly visible. */
async function findAlternatives(itemId, range, { limit = 6, userId } = {}) {
  const source = await Item.findOne(Item.publicFilter({ _id: itemId })).select('category tags depositAmount').lean();
  if (!source) return null;

  const blocked = await unavailableItemIds(range, { exceptUserId: userId });
  const exclude = [source._id, ...blocked];
  const base = { category: source.category, _id: { $nin: exclude } };
  const select = 'title photos category depositAmount owner tags createdAt';

  const [tagged, recent] = await Promise.all([
    source.tags?.length
      ? Item.find(Item.publicFilter({ ...base, tags: { $in: source.tags } })).select(select).limit(CANDIDATE_CAP).lean()
      : [],
    Item.find(Item.publicFilter(base)).select(select).sort('-createdAt').limit(CANDIDATE_CAP).lean(),
  ]);

  const merged = new Map();
  [...tagged, ...recent].forEach((c) => merged.set(String(c._id), c));
  const top = rankAlternatives(source, [...merged.values()], limit);

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
