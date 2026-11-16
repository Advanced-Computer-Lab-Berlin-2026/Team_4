// Member 2 - money policy in ONE place (Req 77, 81). These values are not given by the requirements sheet:
// they are the PROPOSED DEFAULTS documented in docs/sprint2/member2.md and must be confirmed with the team.
// GET /api/payments/policy exposes them so borrowers see the rules before paying.
const { FREE_CANCELLATION_HOURS } = require('../../config/constants');

module.exports = Object.freeze({
  cancellation: Object.freeze({
    freeCancellationHours: FREE_CANCELLATION_HOURS, // full refund if cancelled at least this long before pickup
    partialRefundPercent: 50, // refund when cancelled later than that (but before pickup)
  }),
  lateFee: Object.freeze({
    graceMinutes: 60, // returns within this long after the deadline are not charged
    percentOfDepositPerDay: 10, // per STARTED day late
    capPercentOfDeposit: 100, // never more than the deposit itself
  }),
});
