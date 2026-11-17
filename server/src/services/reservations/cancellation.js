const ApiError = require('../../utils/ApiError');
const { FREE_CANCELLATION_HOURS, CURRENCY } = require('../../config/constants');
const { withReservation } = require('./reservationCommands');
const { features, requireFeature, enqueueReservationEvent } = require('../sprint2/bootstrap');

async function cancel({ actorId, reservationId, reason = '', session }, deps = features()) {
  if (typeof reason !== 'string' || reason.length > 500) throw ApiError.badRequest('Use a reason of up to 500 characters');
  return withReservation({ actorId, reservationId, session }, async (reservation, actor, transaction) => {
    if (!reservation.borrower.equals(actor._id)) throw ApiError.forbidden('Only the borrower can cancel this reservation');
    if (reservation.status === 'cancelled') return reservation;
    const now = new Date();
    const wasHandedOver = reservation.pickedUpAt || reservation.fulfilment?.deliveryStatus === 'delivered';
    if (!['pending', 'confirmed'].includes(reservation.status) || wasHandedOver || now >= reservation.startDate) {
      throw ApiError.conflict('You can only cancel before the pickup date');
    }

    const heldMinor = Math.round((reservation.deposit?.amount || 0) * 100);
    const deliveryMinor = Math.round((reservation.fulfilment?.deliveryFee || 0) * 100);
    let refundMinor = 0;
    let deliveryRefundMinor = 0;
    if (heldMinor > 0 || deliveryMinor > 0) {
      if (heldMinor > 0 && reservation.deposit.status !== 'held') {
        throw ApiError.conflict('The reservation deposit is no longer held');
      }
      const settle = requireFeature(deps.payment, 'settleCancellation', 'Cancellation refunds');
      const settlement = await settle({
        reservationId: String(reservation._id), borrowerId: String(actor._id),
        amountMinor: heldMinor, deliveryMinor, currency: CURRENCY, cancelledAt: now, pickupDate: reservation.startDate,
        freeCancellationHours: FREE_CANCELLATION_HOURS, idempotencyKey: 'cancel:' + reservation._id,
      }, transaction);
      refundMinor = settlement.refundMinor;
      if (!Number.isSafeInteger(refundMinor) || refundMinor < 0 || refundMinor > heldMinor) {
        throw new Error('Invalid cancellation refund amount');
      }
      deliveryRefundMinor = settlement.deliveryRefundMinor ?? 0;
      if (deliveryRefundMinor !== deliveryMinor) {
        // An older payment service must not finalize an incomplete refund.
        throw new ApiError(503, 'Delivery refunds are unavailable. Please try again later.');
      }
      if (heldMinor > 0) {
        reservation.deposit.forfeited = (heldMinor - refundMinor) / 100;
        reservation.deposit.status = refundMinor === heldMinor ? 'refunded' :
          refundMinor === 0 ? 'forfeited' : 'partially_forfeited';
      }
    }
    reservation.cancellation = {
      at: now, by: actor._id, reason: reason.trim(),
      refundAmount: (refundMinor + deliveryRefundMinor) / 100,
    };
    reservation.status = 'cancelled';
    await reservation.save({ session: transaction });
    await enqueueReservationEvent(deps.events, reservation, 'cancelled', transaction);
    return reservation;
  });
}

module.exports = { cancel };
