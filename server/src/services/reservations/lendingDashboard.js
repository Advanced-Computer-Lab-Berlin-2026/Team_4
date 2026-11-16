/**
 * LENDING DASHBOARD - Owner: Member 5 - Requirement: 106. Contract: docs/sprint2/member5.md §7
 * A verified lender's own figures, read only from Reservation and DamageReport (the plan allows feature services to
 * read other models). Never writes.
 *  - Items lent: completed loans of my items; "out now" = active bookings.
 *  - Deposits collected: deposit.amount of bookings that went ahead (confirmed, active, completed); requests,
 *    cancellations and rejections are left out because their deposits go back. "Held now" = deposit.status "held".
 *  - Damage incident rate: upheld damage cases ÷ completed loans. Upheld = decided or resolved with money kept
 *    (resolution.finalForfeitAmount, else decision.forfeitAmount, above 0). Open or disputed cases don't count yet.
 *  - Period "30d": loans completed and deposits taken (booking created) in the last 30 days; damage counts only for
 *    the loans completed in that period, so the rate always compares the same loans (never above 100%).
 *    "Out now", "held now" and "waiting" are always right now.
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { Reservation, DamageReport, Item } = require('../../models');

const DAY_MS = 24 * 60 * 60 * 1000;
const WENT_AHEAD = ['confirmed', 'active', 'completed'];
const PERIODS = ['all', '30d'];
const round2 = (n) => Math.round(n * 100) / 100;

/** Final amount kept for a damage case (Member 3's rule), or 0. */
const keptAmount = (c) => {
  const v = c.resolution?.finalForfeitAmount ?? c.decision?.forfeitAmount;
  return typeof v === 'number' && v > 0 ? v : 0;
};

async function getDashboard(user, query = {}) {
  const period = query.period === undefined || query.period === '' ? 'all' : query.period;
  if (!PERIODS.includes(period)) {
    throw ApiError.badRequest('Choose a period: all or 30d', [{ field: 'period', message: 'Choose a period: all or 30d' }]);
  }
  const lender = new mongoose.Types.ObjectId(String(user._id));
  const now = new Date();
  const since = period === '30d' ? new Date(now.getTime() - 30 * DAY_MS) : null;

  const rows = await Reservation.find({ lender }).select('item status deposit createdAt completedAt returnedAt endDate extension').lean();
  const ids = rows.map((r) => r._id);
  const cases = ids.length ? await DamageReport.find({ reservation: { $in: ids } })
    .select('reservation status decision resolution updatedAt').lean() : [];

  const inPeriod = (date) => !since || (date && new Date(date) >= since);
  const completedAt = (r) => r.completedAt || r.returnedAt;
  const perItem = new Map();
  const itemRow = (id) => {
    const key = String(id);
    if (!perItem.has(key)) perItem.set(key, { itemId: id, timesLent: 0, activeNow: 0, depositsCollected: 0, damageUpheld: 0 });
    return perItem.get(key);
  };
  const byReservation = new Map(rows.map((r) => [String(r._id), r]));

  let completed = 0; let activeNow = 0; let totalCollected = 0; let heldNow = 0; let requests = 0; let extensions = 0;
  for (const r of rows) {
    const row = itemRow(r.item);
    if (r.status === 'completed' && inPeriod(completedAt(r))) { completed += 1; row.timesLent += 1; }
    if (r.status === 'active') { activeNow += 1; row.activeNow += 1; }
    const amount = Number(r.deposit?.amount) || 0;
    if (WENT_AHEAD.includes(r.status) && inPeriod(r.createdAt)) { totalCollected += amount; row.depositsCollected += amount; }
    if (r.deposit?.status === 'held') heldNow += amount;
    if (r.status === 'pending') requests += 1;
    if (r.status === 'active' && r.extension?.status === 'pending' && r.endDate > now) extensions += 1;
  }

  let upheld = 0;
  for (const c of cases) {
    const r = byReservation.get(String(c.reservation));
    if (!r || !['decided', 'resolved'].includes(c.status) || keptAmount(c) <= 0) continue;
    if (r.status !== 'completed' || !inPeriod(completedAt(r))) continue; // same loans as "times lent"
    upheld += 1;
    itemRow(r.item).damageUpheld += 1;
  }

  // Item titles (archived included; a deleted item stays as "Deleted item").
  const items = await Item.find({ _id: { $in: [...perItem.keys()] } }).select('title isArchived photos').lean();
  const info = new Map(items.map((i) => [String(i._id), i]));
  const table = [...perItem.values()]
    .map((row) => {
      const i = info.get(String(row.itemId));
      return {
        item: i ? { _id: i._id, title: i.title, isArchived: !!i.isArchived, photo: i.photos?.[0]?.url || null } : null,
        timesLent: row.timesLent, activeNow: row.activeNow, depositsCollected: round2(row.depositsCollected), damageUpheld: row.damageUpheld,
      };
    })
    .sort((a, b) => b.timesLent - a.timesLent || b.depositsCollected - a.depositsCollected
      || (a.item?.title || '￿').localeCompare(b.item?.title || '￿'));

  return {
    period,
    loans: { completed, activeNow },
    deposits: { totalCollected: round2(totalCollected), heldNow: round2(heldNow), currency: 'EGP' },
    damage: { upheld, completedLoans: completed, rate: completed ? Math.round((upheld / completed) * 1000) / 1000 : 0 },
    needsAction: { requests, extensions },
    items: table,
  };
}

module.exports = { getDashboard, PERIODS };
