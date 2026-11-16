// Member 2 - NFR 14 audit trail. Every money calculation records what went in (inputs) and what came out
// (result), with a timestamp (`at`, set by the model) and the reservation id. Written in the SAME transaction
// as the money change, so an audit row exists if and only if the change happened.
const AuditLog = require('../../models/AuditLog');
const { fromMinor } = require('./money');

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

module.exports = { record };
