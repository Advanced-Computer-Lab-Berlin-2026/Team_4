const { Reservation, ReservationHold } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { bookingKeys, transactBooking } = require('./bookingLock');
const { normalizeRange, objectId } = require('./availability');
const { loadActor, getEntitlements, assertCapacity, loadBookableItem } = require('./bookingRules');
const { features, enqueueReservationEvent } = require('../sprint2/bootstrap');

const participantFilter = (actorId) => ({ $or: [{ borrower: actorId }, { lender: actorId }] });

function reservationView(reservation) {
  return {
    id: String(reservation._id), itemId: String(reservation.item?._id || reservation.populated('item') || reservation.item),
    title: reservation.item?.title || 'Unavailable listing',
    borrowerId: String(reservation.borrower), lenderId: String(reservation.lender),
    startDate: reservation.startDate, endDate: reservation.endDate, status: reservation.status,
    depositAmount: reservation.deposit?.amount ?? 0, refundAmount: reservation.cancellation?.refundAmount,
    fulfilmentMethod: reservation.fulfilment?.method || 'pickup',
  };
}

async function getParticipantReservation(actorId, id, session) {
  const reservation = await Reservation.findOne({
    _id: objectId(id), ...participantFilter(actorId),
  }).session(session || null);
  if (!reservation) throw ApiError.notFound('Reservation not found');
  return reservation;
}

async function listReservations(actorId, page = 1) {
  const query = participantFilter(actorId);
  const rows = await Reservation.find(query).populate('item', 'title')
    .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(21);
  return { items: rows.slice(0, 20).map(reservationView), hasNext: rows.length > 20 };
}

async function withReservation(params, work) {
  const { actorId, reservationId, session } = params;
  const first = await getParticipantReservation(actorId, reservationId, session);
  const keys = bookingKeys([first.item], first.borrower);
  return transactBooking(keys, async (transaction) => {
    const actor = await loadActor(actorId, transaction);
    const record = await getParticipantReservation(actorId, reservationId, transaction);
    return work(record, actor, transaction);
  }, session);
}

const lenderCommands = {
  confirm: { from: ['pending'], to: 'confirmed' },
  reject: { from: ['pending'], to: 'rejected' },
  pickup: { from: ['confirmed'], to: 'active' },
  return: { from: ['active'], to: 'completed' },
};

async function transition(params, deps = features()) {
  const rule = lenderCommands[params.action];
  if (!rule) throw ApiError.badRequest('Invalid reservation action');
  return withReservation(params, async (record, actor, session) => {
    if (!record.lender.equals(actor._id) || !actor.isVerifiedLender()) throw ApiError.forbidden();
    if (record.status === rule.to) return record;
    if (!rule.from.includes(record.status)) throw ApiError.conflict('Invalid reservation status for this action');
    const now = new Date();
    if (params.action === 'confirm') {
      if (record.endDate <= now) throw ApiError.conflict('This reservation has already ended');
      const borrower = await loadActor(record.borrower, session);
      const entitlements = await getEntitlements(borrower, now, session, deps);
      await loadBookableItem(record.item, borrower, record, entitlements, deps, {
        session, excludeReservationId: record._id,
      });
    }
    if (params.action === 'pickup' && record.startDate > now) {
      throw ApiError.conflict('Pickup is before the booked start date');
    }
    if (['reject', 'return'].includes(params.action) && record.deposit?.status === 'held' && !params.beforeCommit) {
      throw new ApiError(503, 'Deposit settlement is unavailable. Please try again later.');
    }
    if (params.action === 'pickup') record.pickedUpAt = now;
    if (params.action === 'return') record.returnedAt = now;
    record.status = rule.to;
    if (params.beforeCommit) await params.beforeCommit(record, session);
    await record.save({ session });
    await enqueueReservationEvent(deps.events, record, rule.to, session);
    return record;
  });
}

async function extend(params, deps = features()) {
  return withReservation(params, async (record, actor, session) => {
    const lender = record.lender.equals(actor._id) && actor.isVerifiedLender();
    const borrower = record.borrower.equals(actor._id);
    if (record.status !== 'active') throw ApiError.conflict('Only active reservations can be extended');
    if (params.action === 'request') {
      if (!borrower) throw ApiError.forbidden();
      const { endDate } = normalizeRange({ startDate: record.startDate, endDate: params.endDate });
      if (endDate <= record.endDate) throw ApiError.badRequest('Choose a later return date');
      if (record.extension?.status === 'pending') {
        if (+record.extension.requestedEndDate === +endDate) return record;
        throw ApiError.conflict('An extension request is already pending');
      }
      record.extension = { requestedEndDate: endDate, status: 'pending' };
    } else {
      if (!lender) throw ApiError.forbidden();
      const targetStatus = { approve: 'approved', reject: 'rejected' }[params.action];
      if (!targetStatus) throw ApiError.badRequest('Invalid extension action');
      if (record.extension?.status === targetStatus) return record;
      if (record.extension?.status !== 'pending') throw ApiError.conflict('No pending extension request');
      if (targetStatus === 'approved') {
        const borrowerAccount = await loadActor(record.borrower, session);
        const accountTier = await getEntitlements(borrowerAccount, new Date(), session, deps);
        const range = { startDate: record.startDate, endDate: record.extension.requestedEndDate };
        await loadBookableItem(record.item, borrowerAccount, range, accountTier, deps, {
          session, excludeReservationId: record._id,
        });
        record.endDate = range.endDate;
      }
      record.extension.status = targetStatus;
      record.extension.decidedAt = new Date();
    }
    return record.save({ session });
  });
}

// Waitlist promotion hooks execute through the same inventory arbitration as checkout.
async function holdForWaitlist({ borrowerId, itemId, startDate, endDate, expiresAt, session }, deps = features()) {
  const borrower = objectId(borrowerId);
  const item = objectId(itemId);
  const range = normalizeRange({ startDate, endDate }, { booking: true });
  if (!(expiresAt instanceof Date) || !Number.isFinite(+expiresAt) || expiresAt <= new Date()) {
    throw ApiError.badRequest('Choose a future hold expiry');
  }
  return transactBooking(bookingKeys([item], borrower), async (transaction) => {
    const actor = await loadActor(borrower, transaction);
    const entitlements = await getEntitlements(actor, new Date(), transaction, deps);
    await assertCapacity(actor, 1, entitlements, transaction);
    await loadBookableItem(item, actor, range, entitlements, deps, { session: transaction });
    const [hold] = await ReservationHold.create([{ borrower, item, ...range, expiresAt }], { session: transaction });
    return hold;
  }, session);
}

async function releaseWaitlistHold({ holdId, itemId, borrowerId, session }) {
  const hold = objectId(holdId);
  const item = objectId(itemId);
  const borrower = objectId(borrowerId);
  return transactBooking(bookingKeys([item], borrower), (transaction) => ReservationHold.deleteOne({
    _id: hold, item, borrower, attempt: { $exists: false },
  }, { session: transaction }), session);
}

module.exports = {
  reservationView, listReservations, getParticipantReservation, withReservation,
  transition, extend, holdForWaitlist, releaseWaitlistHold,
};
