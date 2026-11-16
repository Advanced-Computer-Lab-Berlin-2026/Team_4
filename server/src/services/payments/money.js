// Member 2 - money helpers. All calculations use integer minor units (piastres: 100 = EGP 1.00),
// because floating-point EGP values drift (0.1 + 0.2 !== 0.3). Convert only at the EGP Number boundary.
const ApiError = require('../../utils/ApiError');
const { CURRENCY } = require('../../config/constants');

/** EGP Number (e.g. 25.5) -> piastres (2550). */
const toMinor = (egp) => Math.round(Number(egp || 0) * 100);

/** piastres (2550) -> EGP Number (25.5), for the existing EGP fields. */
const fromMinor = (minor) => minor / 100;

/** Throws 400 unless amountMinor is a positive whole number of piastres. */
function assertAmountMinor(amountMinor, field = 'amountMinor') {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw ApiError.badRequest(`${field} must be a positive whole number of piastres`);
  }
}

/** Only EGP is supported (the platform currency). */
function assertCurrency(currency = CURRENCY) {
  if (currency !== CURRENCY) throw ApiError.badRequest(`Only ${CURRENCY} is supported`);
  return currency;
}

module.exports = { toMinor, fromMinor, assertAmountMinor, assertCurrency, CURRENCY };
