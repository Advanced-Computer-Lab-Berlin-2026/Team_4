const ApiError = require('../../utils/ApiError');
const { TRUST_SCORE_DEFAULT } = require('../../config/constants');

const DAY_MS = 86_400_000;

function validateBooking(actor, item, { startDate, endDate }) {
  const days = (new Date(endDate) - new Date(startDate)) / DAY_MS;
  if (!Number.isInteger(days) || days < 1) {
    throw ApiError.badRequest('Use a valid borrowing date range');
  }

  const { maxBorrowDays, minTrustScore = 0 } = item.rules || {};
  if (maxBorrowDays && days > maxBorrowDays) {
    throw ApiError.badRequest('The date range exceeds this item’s maximum borrowing duration');
  }
  if ((actor.trustScore ?? TRUST_SCORE_DEFAULT) < minTrustScore) {
    throw ApiError.forbidden('Your trust score does not meet this item’s borrowing rules');
  }
}

module.exports = { validateBooking };
