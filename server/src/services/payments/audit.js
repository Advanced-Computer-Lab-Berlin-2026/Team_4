// Member 2 - NFR 14 audit trail. Every money calculation records what went in (inputs) and what came out
// (result), with a timestamp (`at`, set by the model) and the reservation id. Written in the SAME transaction
// as the money change, so an audit row exists if and only if the change happened.
const AuditLog = require('../../models/AuditLog');
const { fromMinor, toMinor } = require('./money');

async function record({ action, reservationId, userId, amountMinor, operationId, inputs, result }, { session } = {}) {
  const [row] = await AuditLog.create(
    [{
      action,
      reservation: reservationId,
      user: userId,
      amountMinor,
      amount: amountMinor === undefined ? undefined : fromMinor(amountMinor),
      operation: operationId,
      inputs,
      result,
    }],
    { session }
  );
  return row;
}

function checkoutLine({ attemptId, borrowerId, method, line, operationId, paymentReference, balanceMinor }, session) {
  return record({
    action: line.amountMinor > 0 ? 'deposit_charged' : 'deposit_calculated',
    reservationId: line.reservationId, userId: borrowerId, amountMinor: line.amountMinor, operationId,
    inputs: {
      method, paymentReference, checkoutAttemptId: attemptId, itemId: line.itemId,
      startDate: line.startDate, endDate: line.endDate, deposit: line.deposit,
      fulfilmentMethod: line.fulfilment?.method, deliveryFeeMinor: toMinor(line.fulfilment?.deliveryFee),
      lineAmountMinor: line.amountMinor,
    },
    result: { chargedMinor: line.amountMinor, balanceAfterMinor: balanceMinor },
  }, { session });
}

module.exports = { record, checkoutLine };
