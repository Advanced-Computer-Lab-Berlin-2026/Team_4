const { Types } = require('mongoose');
const { Reservation, ReservationHold, DamageReport } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { bookingKeys, transactBooking } = require('./bookingLock');
const { normalizeRange, objectId } = require('./availability');
const { loadActor, getEntitlements, assertCapacity, loadBookableItem } = require('./bookingRules');
const { CURRENCY } = require('../../config/constants');
const { isLateReturn, lifecycleFlags } = require('./returnTiming');
const { features, requireFeature, enqueueReservationEvent } = require('../sprint2/bootstrap');

const participantFilter = (actorId) => ({ $or: [{ borrower: actorId }, { lender: actorId }] });

function reservationView(reservation) {
  return {
    id: String(reservation._id), itemId: String(reservation.item?._id || reservation.populated('item') || reservation.item),
    title: reservation.item?.title || 'Unavailable listing',
    borrowerId: String(reservation.borrower), lenderId: String(reservation.lender),
    startDate: reservation.startDate, endDate: reservation.endDate, status: reservation.status,
    depositAmount: reservation.deposit?.amount ?? 0, refundAmount: reservation.cancellation?.refundAmount,
    fulfilmentMethod: reservation.fulfilment?.method || 'pickup',
    deliveryStatus: deliveryStage(reservation),
    deliveryFee: reservation.fulfilment?.deliveryFee ?? 0,
    returnedAt: reservation.returnedAt, completedAt: reservation.completedAt || reservation.returnedAt,
    returnCondition: reservation.returnCondition, rejectionReason: reservation.rejectionReason,
    ...lifecycleFlags(reservation),
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

const nextDeliveryStage = new Map([['preparing', 'out_for_delivery'], ['out_for_delivery', 'delivered']]);

function deliveryStage(reservation) {
  if (reservation.fulfilment?.method !== 'delivery') return 'none';
  const status = reservation.fulfilment.deliveryStatus;
  return !status || status === 'none' ? 'preparing' : status;
}

async function advanceDelivery({ actorId, reservationId, deliveryStatus }, deps = features()) {
  if (!['out_for_delivery', 'delivered'].includes(deliveryStatus)) {
    throw ApiError.badRequest('Invalid delivery status');
  }
  return withReservation({ actorId, reservationId }, async (record, actor, session) => {
    if (record.fulfilment?.method !== 'delivery') throw ApiError.notFound('Delivery reservation not found');
    if (!record.lender.equals(actor._id) || !actor.isVerifiedLender()) throw ApiError.forbidden();
    const stage = deliveryStage(record);
    if (stage === deliveryStatus) return record;
    if (!['confirmed', 'active'].includes(record.status) || nextDeliveryStage.get(stage) !== deliveryStatus) {
      throw ApiError.conflict('Delivery must progress in order on a confirmed or active reservation');
    }

    const activates = deliveryStatus === 'delivered' && record.status === 'confirmed';
    const now = new Date();
    if (activates && (now < record.startDate || now >= record.endDate)) {
      throw ApiError.conflict('Delivery handover must be within the booked date range');
    }
    record.fulfilment.deliveryStatus = deliveryStatus;
    if (activates) {
      record.status = 'active';
      record.pickedUpAt = now;
    }
    await record.save({ session });

    if (deps.events?.enqueueEvent) {
      const id = record.id;
      await deps.events.enqueueEvent('delivery_status', id, [record.borrower, record.lender].map(String), {
        reservationId: id, itemId: String(record.item), deliveryStatus, link: '/delivery-tracking/' + id,
      }, id + ':delivery:' + deliveryStatus, session);
    }
    return record;
  });
}

const lenderCommands = new Map([
  ['confirm', ['pending', 'confirmed']],
  ['reject', ['pending', 'rejected']],
  ['pickup', ['confirmed', 'active']],
  ['return', ['active', 'completed']],
  ['returnDamaged', ['active', 'completed']],
]);

function paymentContext(record, operation) {
  return {
    reservationId: record.id,
    userId: String(record.borrower),
    reference: record.id,
    currency: CURRENCY,
    idempotencyKey: 'reservation:' + record.id + ':' + operation,
  };
}

async function settleHeldDeposit(record, rejected, deps, session) {
  const depositMinor = Math.round((record.deposit?.amount || 0) * 100);
  const deliveryMinor = rejected ? Math.round((record.fulfilment?.deliveryFee || 0) * 100) : 0;
  const amountMinor = depositMinor + deliveryMinor;
  if (!amountMinor) return;
  if (depositMinor && record.deposit.status !== 'held') {
    throw ApiError.conflict('The reservation deposit is no longer held');
  }
  const operation = rejected ? 'refundToWallet' : 'releaseDeposit';
  const context = paymentContext(record, rejected ? 'reject-refund' : 'release');
  const settle = requireFeature(deps.payment, operation, 'Deposit settlement');
  await settle({ ...context, amountMinor, depositMinor, deliveryMinor }, session);
  if (depositMinor) record.deposit.status = rejected ? 'refunded' : 'released';
}

async function completeReturn(record, damaged, now, deps, session) {
  record.returnedAt = now;
  record.completedAt = now;
  record.returnCondition = damaged ? 'damaged' : 'good';
  if (record.extension?.status === 'pending') {
    record.extension.status = 'cancelled';
    record.extension.decidedAt = now;
  }

  if (!damaged) await settleHeldDeposit(record, false, deps, session);
  if (isLateReturn(now, record.endDate)) {
    const applyLateFee = requireFeature(deps.payment, 'applyLateFee', 'Late fee processing');
    const { feeMinor } = await applyLateFee({
      ...paymentContext(record, 'late-fee'), returnedAt: now, endDate: record.endDate,
    }, session);
    if (!Number.isSafeInteger(feeMinor) || feeMinor < 0) throw new Error('Invalid late fee amount');
    record.lateFee = feeMinor / 100;
  }
}

async function transition(params, deps = features()) {
  const states = lenderCommands.get(params.action);
  if (!states) throw ApiError.badRequest('Invalid reservation action');
  const [from, to] = states;
  const returning = to === 'completed';
  const damaged = params.action === 'returnDamaged';
  return withReservation(params, async (record, actor, session) => {
    if (!record.lender.equals(actor._id) || !actor.isVerifiedLender()) throw ApiError.forbidden();
    if (params.action === 'pickup' && record.fulfilment?.method === 'delivery') {
      throw ApiError.conflict('Mark the delivery as delivered to activate this reservation');
    }
    const damageCase = returning ? await DamageReport.findOne({ reservation: record._id })
      .select('_id status borrower reportedBy').session(session) : null;
    if (returning && !damaged && (damageCase || record.returnCondition === 'damaged')) {
      throw ApiError.conflict('A damage case owns settlement for this reservation');
    }
    if (record.status === to) {
      if (damaged && (record.returnCondition === 'good' || !damageCase)) {
        throw ApiError.conflict('This reservation is already completed');
      }
      return record;
    }
    if ((params.expectedStatus && params.expectedStatus !== record.status) || record.status !== from) {
      throw ApiError.conflict('Invalid reservation status for this action');
    }
    if (damaged && (!params.beforeCommit || damageCase)) {
      throw ApiError.conflict('Record the damaged return and open its damage case together');
    }
    if (damaged && record.deposit?.amount > 0 && record.deposit.status !== 'held') {
      throw ApiError.conflict('The reservation deposit is no longer held');
    }

    const now = new Date();
    if (params.action === 'confirm') {
      if (record.endDate <= now) throw ApiError.conflict('This reservation has already ended');
      const borrower = await loadActor(record.borrower, session);
      const entitlements = await getEntitlements(borrower, now, session, deps);
      await loadBookableItem(record.item, borrower, record, entitlements, deps, {
        session, excludeReservationId: record._id,
      });
    }
    if (params.action === 'reject') {
      if (params.reason != null && (typeof params.reason !== 'string' || params.reason.length > 500)) {
        throw ApiError.badRequest('Use a rejection reason of up to 500 characters');
      }
      record.rejectionReason = params.reason?.trim();
      await settleHeldDeposit(record, true, deps, session);
    }
    if (params.action === 'pickup') {
      if (record.startDate > now || record.endDate <= now) {
        throw ApiError.conflict('Pickup must be within the booked date range');
      }
      record.pickedUpAt = now;
    }
    if (returning) await completeReturn(record, damaged, now, deps, session);

    record.status = to;
    // The damage creator can read the returned reservation in this session.
    if (damaged) await record.save({ session });
    if (params.beforeCommit) await params.beforeCommit(record, session);
    if (!damaged || record.isModified()) await record.save({ session });
    if (damaged) {
      const openCase = await DamageReport.exists({
        reservation: record._id, item: record.item, borrower: record.borrower,
        reportedBy: actor._id, status: 'open',
      }).session(session);
      if (!openCase) throw ApiError.conflict('The damaged return must include an open damage case');
    }
    if (returning && deps.trust?.recalculateTrust) {
      const eventKey = record.id + ':completed';
      for (const userId of [record.borrower, record.lender]) {
        await deps.trust.recalculateTrust(String(userId), { eventKey, session });
      }
    }
    await enqueueReservationEvent(deps.events, record, to, session);
    return record;
  });
}

async function extend(params, deps = features()) {
  const { action } = params;
  if (!['request', 'cancel', 'approve', 'reject'].includes(action)) {
    throw ApiError.badRequest('Invalid extension action');
  }
  return withReservation(params, async (record, actor, session) => {
    const borrowerAction = action === 'request' || action === 'cancel';
    const permitted = borrowerAction ? record.borrower.equals(actor._id) :
      record.lender.equals(actor._id) && actor.isVerifiedLender();
    if (!permitted) throw ApiError.forbidden();
    if (record.status !== 'active') throw ApiError.conflict('Only active reservations can be extended');
    const now = new Date();
    const target = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' }[action];

    if (action === 'request') {
      if (now >= record.endDate) throw ApiError.conflict('The return deadline has passed');
      const { endDate } = normalizeRange({ startDate: record.startDate, endDate: params.endDate });
      if (endDate <= record.endDate) throw ApiError.badRequest('Choose a later return date');
      if (record.extension?.status === 'pending') {
        if (+record.extension.requestedEndDate === +endDate) return record;
        throw ApiError.conflict('An extension request is already pending');
      }
      record.extension = { requestId: new Types.ObjectId(), requestedEndDate: endDate, status: 'pending' };
    } else {
      if (record.extension?.requestId && !params.requestId) {
        throw ApiError.badRequest('Supply the extension request ID');
      }
      if (params.requestId && String(record.extension?.requestId) !== objectId(params.requestId)) {
        throw ApiError.conflict('This extension request is no longer current');
      }
      if (record.extension?.status === target) return record;
      if (lifecycleFlags(record, now).extensionStatus !== 'pending') {
        throw ApiError.conflict('No pending, unexpired extension request');
      }
      if (action === 'approve') {
        const borrower = await loadActor(record.borrower, session);
        const entitlements = await getEntitlements(borrower, now, session, deps);
        const range = { startDate: record.startDate, endDate: record.extension.requestedEndDate };
        await loadBookableItem(record.item, borrower, range, entitlements, deps, {
          session, excludeReservationId: record._id,
        });
        record.endDate = range.endDate;
      }
      record.extension.status = target;
      record.extension.decidedAt = now;
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
  advanceDelivery, deliveryStage,
  reservationView, listReservations, getParticipantReservation, withReservation,
  transition, extend, holdForWaitlist, releaseWaitlistHold,
};
