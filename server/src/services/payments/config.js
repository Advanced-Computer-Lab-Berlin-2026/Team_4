// Member 2 - money policy in ONE place (Req 77, 81). These values are not given by the requirements sheet:
// they are the PROPOSED DEFAULTS documented in docs/sprint2/member2.md and must be confirmed with the team.
// GET /api/payments/policy exposes them so borrowers see the rules before paying.
const { FREE_CANCELLATION_HOURS } = require('../../config/constants');

module.exports = Object.freeze({
  // Who receives the part of a deposit a borrower loses (late cancellation now; late fees and damage later).
  // 'lender' = credited to the lender's wallet; 'platform' = kept by ShareShed (no wallet credit). OPEN DECISION.
  forfeitedFundsTo: 'lender',
  cancellation: Object.freeze({
    freeCancellationHours: FREE_CANCELLATION_HOURS, // full refund if cancelled at least this long before pickup
    partialRefundPercent: 50, // refund when cancelled later than that (but before pickup)
  }),
  lateFee: Object.freeze({
    graceMinutes: 0, // a return at the due time is on time (Req 77)
    percentOfDepositPerDay: 10, // per STARTED day late
    capPercentOfDeposit: 100, // never more than the deposit itself
  }),
});
