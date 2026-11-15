/**
 * DAMAGE SERVICE - Owner: Member 3 - Requirements: 61, 62, 63, 64, 80
 * Contract: docs/sprint2/member3.md §2
 *
 *   open --admin decides--> decided --borrower disputes--> disputed --admin resolves--> resolved
 *
 * Every state change is a conditional update on the current status inside a transaction, so two admins
 * (or a retried request) can't decide the same report twice. Money moves only through ./settlement
 * (Member 2), with one idempotency key per step; if settlement fails, the status change rolls back too.
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const DamageReport = require('../../models/DamageReport');
const Reservation = require('../../models/Reservation');
const { ROLES } = require('../../config/constants');
const settlement = require('./settlement');
const { recalculateTrust } = require('../reviews/trust');

/** Decisions D2-D4 in the contract. */
const DAMAGE_CONFIG = Object.freeze({ reportWindowHours: 48, disputeWindowDays: 7 });
const HOUR_MS = 60 * 60 * 1000;
const PERSON = 'username name';

const sameId = (a, b) => a != null && b != null && String(a?._id ?? a) === String(b?._id ?? b);
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const isAdmin = (user) => user.role === ROLES.ADMIN;

const disputeDeadline = (report) =>
  report.decision?.decidedAt ? new Date(new Date(report.decision.decidedAt).getTime() + DAMAGE_CONFIG.disputeWindowDays * 24 * HOUR_MS) : null;

/** Photo metadata only - stored paths never leave the server (contract §3). */
const photoList = (photos = [], stage) =>
  photos.map((p, index) => ({ _id: p._id ?? `${stage}-${index}`, stage, originalName: p.originalName, mimeType: p.mimeType, size: p.size, uploadedBy: p.uploadedBy, takenAt: p.takenAt }));

function toReportDto(report, { withPhotos = false } = {}) {
  const r = report.toObject ? report.toObject() : report;
  const res = r.reservation && r.reservation._id ? r.reservation : null;
  const dto = {
    _id: r._id,
    status: r.status,
    description: r.description,
    reservation: res
      ? { _id: res._id, startDate: res.startDate, endDate: res.endDate, returnedAt: res.returnedAt, deposit: { amount: res.deposit?.amount ?? 0, status: res.deposit?.status ?? 'none' } }
      : r.reservation,
    item: r.item && r.item._id ? { _id: r.item._id, title: r.item.title } : r.item,
    reportedBy: r.reportedBy,
    borrower: r.borrower,
    decision: r.decision?.decidedAt ? r.decision : null,
    dispute: r.dispute?.at ? r.dispute : null,
    resolution: r.resolution?.resolvedAt ? r.resolution : null,
    disputeDeadline: disputeDeadline(r),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  if (withPhotos) {
    const photos = res?.conditionPhotos || {};
    dto.photos = { pickup: photoList(photos.pickup, 'pickup'), return: photoList(photos.return, 'return') };
  }
  return dto;
}

const populateReport = (query, { withPhotos = false } = {}) =>
  query
    .populate('reservation', `startDate endDate returnedAt deposit${withPhotos ? ' conditionPhotos' : ''}`)
    .populate('item', 'title')
    .populate('reportedBy', PERSON)
    .populate('borrower', PERSON)
    .populate('decision.decidedBy', PERSON)
    .populate('resolution.resolvedBy', PERSON);

async function findReportFor(user, id) {
  const report = await DamageReport.findById(id).select('reportedBy borrower status').lean();
  if (!report) throw ApiError.notFound('Damage report not found');
  if (!isAdmin(user) && !sameId(report.reportedBy, user._id) && !sameId(report.borrower, user._id)) {
    throw ApiError.notFound('Damage report not found'); // don't reveal other people's cases
  }
  return report;
}

const loadDto = async (id, opts) => toReportDto(await populateReport(DamageReport.findById(id), opts).lean(), opts);

/** Map a failed conditional update to the right error by re-reading the report. */
async function explainConflict(id, expected) {
  const current = await DamageReport.findById(id).select('status').lean();
  if (!current) return ApiError.notFound('Damage report not found');
  return ApiError.conflict(`This damage report is ${current.status}, not ${expected}`);
}

/** Req 61 - the lender opens a report for a returned reservation whose deposit is still held. */
async function createReport(actor, { reservationId, description }) {
  const reservation = await Reservation.findById(reservationId).select('item borrower lender status returnedAt deposit').lean();
  if (!reservation) throw ApiError.notFound('Reservation not found');
  if (!sameId(reservation.lender, actor._id)) throw ApiError.forbidden('Only the lender of this reservation can report damage');
  if (!reservation.returnedAt || !['active', 'completed'].includes(reservation.status)) {
    throw ApiError.conflict('You can report damage only after the item has been returned');
  }
  if (Date.now() > new Date(reservation.returnedAt).getTime() + DAMAGE_CONFIG.reportWindowHours * HOUR_MS) {
    throw ApiError.conflict(`Damage must be reported within ${DAMAGE_CONFIG.reportWindowHours} hours of the return`);
  }
  if (reservation.deposit?.status !== 'held') {
    throw ApiError.conflict('The deposit for this reservation is no longer held, so damage can no longer be reported');
  }
  try {
    const report = await DamageReport.create({
      reservation: reservation._id,
      item: reservation.item,
      reportedBy: actor._id,
      borrower: reservation.borrower,
      description,
    });
    // TODO(M9): enqueueEvent('damage.reported', report._id, [borrower, admins], …, `damage:${report._id}:reported`)
    return loadDto(report._id, { withPhotos: true });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('A damage report already exists for this reservation');
    throw err;
  }
}

/** Reports where the user is the reporting lender or the borrower. role: 'lender' | 'borrower' | undefined (both). */
async function listMyReports(userId, { role, skip, limit }) {
  const filter = role === 'lender' ? { reportedBy: userId } : role === 'borrower' ? { borrower: userId } : { $or: [{ reportedBy: userId }, { borrower: userId }] };
  const [items, total] = await Promise.all([
    populateReport(DamageReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)).lean(),
    DamageReport.countDocuments(filter),
  ]);
  return { items: items.map((r) => toReportDto(r)), total };
}

/** Admin work queue (Req 62, 64), oldest first so cases are handled in order. */
async function listReports({ status, skip, limit }) {
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([
    populateReport(DamageReport.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit)).lean(),
    DamageReport.countDocuments(filter),
  ]);
  return { items: items.map((r) => toReportDto(r)), total };
}

/** Req 80 - one report with before/after photo metadata, for participants and admins. */
async function getReport(user, id) {
  await findReportFor(user, id);
  return loadDto(id, { withPhotos: true });
}

/** Req 62 - admin decides how much of the held deposit to keep (0 = release everything). */
async function decideReport(admin, id, { forfeitAmount, note }) {
  const amount = round2(forfeitAmount);
  await mongoose.connection.transaction(async (session) => {
    const report = await DamageReport.findOne({ _id: id }).populate({ path: 'reservation', select: 'deposit' }).session(session);
    if (!report) throw ApiError.notFound('Damage report not found');
    if (report.status !== 'open') throw ApiError.conflict(`This damage report is ${report.status}, not open`);
    const held = round2(report.reservation?.deposit?.amount ?? 0);
    if (report.reservation?.deposit?.status !== 'held') throw ApiError.conflict('The deposit for this reservation is no longer held');
    if (amount > held) throw ApiError.badRequest(`Forfeit amount cannot exceed the held deposit (EGP ${held.toFixed(2)})`);

    const updated = await DamageReport.findOneAndUpdate(
      { _id: id, status: 'open' },
      { $set: { status: 'decided', decision: { forfeitAmount: amount, note, decidedBy: admin._id, decidedAt: new Date() } } },
      { session, new: true }
    );
    if (!updated) throw await explainConflict(id, 'open');
    await settlement.settleForfeiture({ reservationId: report.reservation._id, amount, idempotencyKey: `damage:${id}:decision`, session });
    await recalculateTrust(report.borrower, { session, eventKey: `damage:${id}:decided` });
  });
  // TODO(M9): enqueueEvent('damage.decided', …, `damage:${id}:decided`)
  return loadDto(id, { withPhotos: true });
}

/** Req 63 - the borrower disputes a decision that kept part of their deposit, within the dispute window. */
async function disputeReport(actor, id, { reason }) {
  const report = await findReportFor(actor, id);
  if (!sameId(report.borrower, actor._id)) throw ApiError.forbidden('Only the borrower can dispute this decision');
  const current = await DamageReport.findById(id).select('status decision').lean();
  if (current.status !== 'decided') throw ApiError.conflict(`This damage report is ${current.status}, not decided`);
  if (!(current.decision?.forfeitAmount > 0)) throw ApiError.conflict('Nothing was kept from your deposit, so there is nothing to dispute');
  if (Date.now() > disputeDeadline(current).getTime()) {
    throw ApiError.conflict(`Decisions can be disputed only within ${DAMAGE_CONFIG.disputeWindowDays} days`);
  }
  const updated = await DamageReport.findOneAndUpdate(
    { _id: id, status: 'decided', 'dispute.at': { $exists: false } },
    { $set: { status: 'disputed', dispute: { reason, at: new Date() } } },
    { new: true }
  );
  if (!updated) throw await explainConflict(id, 'decided');
  // TODO(M9): enqueueEvent('damage.disputed', …, `damage:${id}:disputed`)
  return loadDto(id, { withPhotos: true });
}

/** Req 64 - admin records the final amount (never more than the decision); only the difference is refunded. */
async function resolveReport(admin, id, { finalForfeitAmount, note }) {
  const finalAmount = round2(finalForfeitAmount);
  await mongoose.connection.transaction(async (session) => {
    const report = await DamageReport.findById(id).session(session);
    if (!report) throw ApiError.notFound('Damage report not found');
    if (report.status !== 'disputed') throw ApiError.conflict(`This damage report is ${report.status}, not disputed`);
    const decided = round2(report.decision.forfeitAmount);
    if (finalAmount > decided) {
      throw ApiError.badRequest(`The final amount cannot exceed the original decision (EGP ${decided.toFixed(2)})`);
    }
    const updated = await DamageReport.findOneAndUpdate(
      { _id: id, status: 'disputed' },
      { $set: { status: 'resolved', resolution: { finalForfeitAmount: finalAmount, note, resolvedBy: admin._id, resolvedAt: new Date() } } },
      { session, new: true }
    );
    if (!updated) throw await explainConflict(id, 'disputed');
    const refund = round2(decided - finalAmount);
    if (refund > 0) {
      await settlement.refundToWallet({
        userId: report.borrower,
        amount: refund,
        reference: `damage:${id}`,
        idempotencyKey: `damage:${id}:resolution`,
        session,
      });
    }
    await recalculateTrust(report.borrower, { session, eventKey: `damage:${id}:resolved` });
  });
  // TODO(M9): enqueueEvent('damage.resolved', …, `damage:${id}:resolved`)
  return loadDto(id, { withPhotos: true });
}

/** For Member 5 (Req 60): true while a report is open, so "returned in good condition" must be refused. */
async function hasOpenDamageCase(reservationId, { session = null } = {}) {
  return Boolean(await DamageReport.exists({ reservation: reservationId, status: 'open' }).session(session));
}

module.exports = {
  DAMAGE_CONFIG,
  createReport,
  listMyReports,
  listReports,
  getReport,
  decideReport,
  disputeReport,
  resolveReport,
  hasOpenDamageCase,
  toReportDto,
};
