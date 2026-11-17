const { createHash } = require('node:crypto');
const { Types } = require('mongoose');
const { CheckoutAttempt, Reservation, ReservationHold, BorrowList, HouseholdLink } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { CURRENCY } = require('../../config/constants');
const { bookingKeys, transactBooking } = require('./bookingLock');
const { normalizeRange, objectId } = require('./availability');
const { loadActor, getEntitlements, assertCapacity, loadBookableItem } = require('./bookingRules');
const { features, requireFeature } = require('../sprint2/bootstrap');

const MAX_LINES = 25;
const HOLD_MS = 30 * 60 * 1000;
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function selection(input) {
  if (input.source === 'borrowList') return { source: 'borrowList' };
  if (input.source !== 'single') throw ApiError.badRequest('Choose a reservation or the borrow list');
  const { startDate, endDate } = normalizeRange(input);
  return {
    source: 'single', itemId: objectId(input.itemId), startDate, endDate,
    ...(input.holdId && { holdId: objectId(input.holdId) }),
  };
}

function normalizeFulfilment(value) {
  if (!value || !['pickup', 'delivery'].includes(value.method) ||
      (value.method === 'delivery' &&
        (typeof value.deliveryAddress !== 'string' || !value.deliveryAddress.trim() || value.deliveryAddress.length > 500))) {
    throw ApiError.badRequest('Choose pickup or supply a valid delivery address');
  }
  return value.method === 'delivery'
    ? { method: 'delivery', deliveryAddress: value.deliveryAddress.trim() } : { method: 'pickup' };
}

function options(input) {
  if (input.promoCode != null && (typeof input.promoCode !== 'string' || input.promoCode.length > 80)) {
    throw ApiError.badRequest('Invalid promo code');
  }
  const perEntry = input.fulfilmentByEntry;
  if (perEntry != null && (input.source !== 'borrowList' || input.fulfilment != null ||
      typeof perEntry !== 'object' || Array.isArray(perEntry) || Object.keys(perEntry).length > MAX_LINES)) {
    throw ApiError.badRequest('Choose fulfilment for entries in your borrow list');
  }
  const entries = perEntry == null ? [] : Object.entries(perEntry).map(([id, value]) => [
    String(objectId(id)), normalizeFulfilment(value),
  ]);
  entries.sort(([left], [right]) => left.localeCompare(right));
  return {
    promo: input.promoCode?.trim(),
    fulfilment: normalizeFulfilment(input.fulfilment ?? { method: 'pickup' }),
    ...(entries.length > 0 && { fulfilmentByEntry: Object.fromEntries(entries) }),
  };
}

async function draft(borrower, selected, session) {
  if (selected.source === 'single') {
    return [{
      item: selected.itemId,
      ...normalizeRange(selected, { booking: true }),
    }];
  }
  const list = await BorrowList.findOne({ user: borrower }).session(session || null);
  const entries = list?.entries || [];
  if (!entries.length) throw ApiError.conflict('Your borrow list is empty');
  if (entries.length > MAX_LINES) throw ApiError.badRequest('Check out at most ' + MAX_LINES + ' items at a time');
  return entries.map((line) => ({
    entryId: line._id, item: line.item, ...normalizeRange(line, { booking: true }),
  }));
}

function assertNoInternalOverlap(lines) {
  for (const [index, line] of lines.entries()) {
    if (lines.slice(0, index).some((other) => String(line.item) === String(other.item) &&
      other.startDate < line.endDate && other.endDate > line.startDate)) {
      throw ApiError.conflict('The borrow list contains overlapping dates for the same item');
    }
  }
}

async function quoteLine(item, line, actor, entitlements, selectedOptions, deps, session) {
  const { promo, fulfilment } = selectedOptions;
  if (fulfilment.method === 'delivery' && !item.delivery?.offered) {
    throw ApiError.badRequest('Delivery is unavailable for ' + item.title);
  }
  if (deps.pricing?.quote) {
    return deps.pricing.quote(item, line, entitlements, promo, fulfilment, { session, borrowerId: String(actor._id) });
  }
  if (promo || fulfilment.method === 'delivery') {
    requireFeature(deps.pricing, 'quote', 'Delivery and discount pricing');
  }
  // Basic Sprint 1 pickup listings can be quoted before the pricing service is merged.
  if (item.depositAmount > 0 && !deps.membership?.getEntitlements &&
    await HouseholdLink.exists({ status: 'accepted', $or: [{ requester: actor._id }, { recipient: actor._id }] })
      .session(session || null)) {
    throw new ApiError(503, 'Household pricing is unavailable. Please try again later.');
  }
  const categoryMultiplier = item.category?.depositMultiplier ?? 1;
  const tierDiscountPercent = entitlements.discountPercent || 0;
  const amountMinor = Math.round(item.depositAmount * categoryMultiplier * (100 - tierDiscountPercent));
  return {
    amountMinor,
    deposit: { base: item.depositAmount, categoryMultiplier, tierDiscountPercent, amount: amountMinor / 100 },
    fulfilment: { method: 'pickup', deliveryFee: 0 },
  };
}

function publicLine(line) {
  return {
    itemId: String(line.item), title: line.title, startDate: line.startDate, endDate: line.endDate,
    ...(line.entryId && { entryId: String(line.entryId) }),
    amountMinor: line.amountMinor, deposit: line.deposit, fulfilment: line.fulfilment,
  };
}

async function price(borrower, sourceLines, selectedOptions, deps, session, holdId) {
  assertNoInternalOverlap(sourceLines);
  const entryOptions = selectedOptions.fulfilmentByEntry || {};
  const entryIds = new Set(sourceLines.map((line) => String(line.entryId)));
  if (Object.keys(entryOptions).some((id) => !entryIds.has(id))) {
    throw ApiError.conflict('The borrow list changed. Review checkout again.');
  }
  const actor = await loadActor(borrower, session);
  const entitlements = await getEntitlements(actor, new Date(), session, deps);
  if (holdId) {
    const [line] = sourceLines;
    const claim = await ReservationHold.exists({
      _id: holdId, borrower, item: line.item, startDate: line.startDate, endDate: line.endDate,
      attempt: { $exists: false }, expiresAt: { $gt: new Date() },
    }).session(session || null);
    if (!claim) throw ApiError.conflict('This waitlist offer is no longer available');
  }
  await assertCapacity(actor, sourceLines.length, entitlements, session, undefined, holdId);
  const lines = [];
  for (const line of sourceLines) {
    const item = await loadBookableItem(line.item, actor, line, entitlements, deps, { session, excludeHoldId: holdId });
    const quote = await quoteLine(item, line, actor, entitlements, {
      promo: selectedOptions.promo,
      fulfilment: entryOptions[String(line.entryId)] ?? selectedOptions.fulfilment,
    }, deps, session);
    if (!Number.isSafeInteger(quote.amountMinor) || quote.amountMinor < 0 ||
      !Number.isFinite(quote.deposit?.amount) || quote.deposit.amount < 0 ||
      !Number.isFinite(quote.fulfilment?.deliveryFee) || quote.fulfilment.deliveryFee < 0 ||
      Math.round((quote.deposit.amount + quote.fulfilment.deliveryFee) * 100) !== quote.amountMinor) {
      throw new Error('Invalid checkout quote');
    }
    lines.push({
      ...line, lender: item.owner, title: item.title, reservationId: new Types.ObjectId(),
      amountMinor: quote.amountMinor, deposit: quote.deposit, fulfilment: quote.fulfilment, promoCode: quote.promoCode,
    });
  }
  const discounted = lines.filter((line) => line.promoCode);
  if (discounted.length > 1) {
    const assertCapacity = requireFeature(deps.promo, 'assertCheckoutPromoCapacity', 'Promo redemption');
    await assertCapacity({
      promoCodeId: discounted[0].promoCode, borrowerId: actor._id, count: discounted.length,
    }, session);
  }
  const amountMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  if (!Number.isSafeInteger(amountMinor)) throw new Error('Invalid checkout total');
  return {
    lines, amountMinor, currency: CURRENCY,
    quoteHash: digest(lines.map((line) => [publicLine(line), line.entryId, line.lender, line.promoCode])),
  };
}

function paymentInput(attempt) {
  return {
    attemptId: String(attempt._id), borrowerId: String(attempt.borrower),
    idempotencyKey: 'checkout:' + attempt._id, amountMinor: attempt.amountMinor,
    currency: attempt.currency, expiresAt: attempt.expiresAt,
    lines: attempt.lines.map((line) => ({ ...publicLine(line), reservationId: String(line.reservationId) })),
  };
}

function result(attempt, redirectUrl) {
  return {
    id: String(attempt._id), status: attempt.status, failure: attempt.failure,
    reservationIds: attempt.status === 'completed' ? attempt.lines.map((line) => String(line.reservationId)) : [],
    ...(redirectUrl && { redirectUrl }),
  };
}

async function createReservations(attempt, deps, session) {
  for (const line of attempt.lines) {
    if (line.promoCode) {
      const redeem = requireFeature(deps.promo, 'redeemCheckoutPromo', 'Promo redemption');
      await redeem({
        promoCodeId: line.promoCode, reservationId: line.reservationId, borrowerId: attempt.borrower,
      }, session);
    }
    await Reservation.create([{
      _id: line.reservationId, item: line.item, borrower: attempt.borrower, lender: line.lender,
      startDate: line.startDate, endDate: line.endDate, checkoutAttempt: attempt._id,
      deposit: { ...line.toObject().deposit, status: line.deposit.amount > 0 ? 'held' : 'none' },
      fulfilment: { ...line.toObject().fulfilment, deliveryStatus: line.fulfilment.method === 'delivery' ? 'preparing' : 'none' },
      promoCode: line.promoCode,
      payment: { method: attempt.method, stripePaymentIntentId: attempt.paymentReference },
    }], { session });
  }
  if (deps.payment?.auditFreeCheckoutLines && attempt.lines.some((line) => line.amountMinor === 0)) {
    await deps.payment.auditFreeCheckoutLines({ ...paymentInput(attempt), method: attempt.method }, session);
  }
  const matchedDraftLines = attempt.lines.filter((line) => line.entryId).map((line) => ({
    _id: line.entryId, item: line.item, startDate: line.startDate, endDate: line.endDate,
  }));
  if (matchedDraftLines.length) {
    await BorrowList.updateOne({ user: attempt.borrower }, {
      $pull: { entries: { $or: matchedDraftLines } },
    }, { session });
  }
  await ReservationHold.deleteMany({ attempt: attempt._id }, { session });
  attempt.status = 'completed';
  await attempt.save({ session });
  return attempt;
}

async function preview(borrower, input, deps = features()) {
  const selected = selection(input);
  const sourceLines = await draft(borrower, selected);
  const { lines, ...quote } = await price(borrower, sourceLines, options(input), deps, null, selected.holdId);
  return {
    ...quote, lines: lines.map(publicLine),
    paymentMethods: [
      ...(!quote.amountMinor || deps.payment?.chargeWalletCheckout ? ['wallet'] : []),
      ...(quote.amountMinor && deps.payment?.startCardPayment && deps.payment?.getCardPayment &&
        deps.payment?.refundFailedCheckout && deps.payment?.recordCardCheckout ? ['card'] : []),
    ],
  };
}

async function begin(borrower, input, deps = features()) {
  const selected = selection(input);
  const selectedOptions = options(input);
  if (!['card', 'wallet'].includes(input.method)) throw ApiError.badRequest('Choose a payment method');
  if (typeof input.operationKey !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(input.operationKey) ||
    typeof input.quoteHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.quoteHash)) {
    throw ApiError.badRequest('Review the checkout quote before submitting');
  }
  const requestHash = digest([selected, selectedOptions, input.method, input.quoteHash]);
  const lookup = { borrower, operationKey: input.operationKey };
  const existing = await CheckoutAttempt.findOne(lookup);
  if (existing) return resume(existing);

  let original;
  try {
    original = await draft(borrower, selected);
  } catch (error) {
    // A concurrent successful checkout may have cleared the draft after the lookup.
    const replay = await CheckoutAttempt.findOne(lookup);
    if (replay) return resume(replay);
    throw error;
  }
  const attempt = await transactBooking(bookingKeys(original.map((line) => line.item), borrower), async (session) => {
    const previous = await CheckoutAttempt.findOne(lookup).session(session);
    if (previous) return previous;
    const current = await draft(borrower, selected, session);
    if (digest(current) !== digest(original)) throw ApiError.conflict('The borrow list changed. Review checkout again.');
    const quote = await price(borrower, current, selectedOptions, deps, session, selected.holdId);
    if (quote.quoteHash !== input.quoteHash) throw ApiError.conflict('The checkout quote changed. Review the new total.');

    const record = new CheckoutAttempt({
      ...lookup, requestHash, method: input.method, status: 'awaiting_payment',
      lines: quote.lines, amountMinor: quote.amountMinor, currency: quote.currency,
      expiresAt: new Date(Date.now() + HOLD_MS),
    });
    if (selected.holdId) await ReservationHold.deleteOne({ _id: selected.holdId }, { session });
    if (input.method === 'wallet' || quote.amountMinor === 0) {
      if (quote.amountMinor) {
        const charge = requireFeature(deps.payment, 'chargeWalletCheckout', 'Wallet payments');
        await charge(paymentInput(record), session);
      }
      return createReservations(record, deps, session);
    }
    requireFeature(deps.payment, 'startCardPayment', 'Card payments');
    requireFeature(deps.payment, 'getCardPayment', 'Card payments');
    requireFeature(deps.payment, 'refundFailedCheckout', 'Card payments');
    requireFeature(deps.payment, 'recordCardCheckout', 'Card payments');
    await record.save({ session });
    await ReservationHold.insertMany(record.lines.map((line) => ({
      attempt: record._id, item: line.item, borrower, startDate: line.startDate,
      endDate: line.endDate, expiresAt: record.expiresAt,
    })), { session });
    return record;
  });
  return resume(attempt);

  async function resume(record) {
    if (record.requestHash !== requestHash) throw ApiError.conflict('This checkout key belongs to another request');
    if (record.status !== 'awaiting_payment') return result(record);
    if (record.expiresAt <= new Date()) return reconcileCard(record._id, deps);
    const start = requireFeature(deps.payment, 'startCardPayment', 'Card payments');
    // Provider initialization is idempotent and may be retried after a lost response.
    const provider = await start(paymentInput(record));
    if (provider.state === 'pending' && provider.redirectUrl) return result(record, provider.redirectUrl);
    return reconcileCard(record._id, deps);
  }
}

async function reconcileCard(attemptId, deps = features()) {
  const attempt = await CheckoutAttempt.findById(objectId(attemptId));
  if (!attempt) throw ApiError.notFound('Checkout not found');
  if (attempt.status === 'refund_due') return refundFailed(attempt, deps);
  if (attempt.status !== 'awaiting_payment') return result(attempt);

  const check = requireFeature(deps.payment, 'getCardPayment', 'Card payments');
  const provider = await check({ ...paymentInput(attempt), closeExpired: attempt.expiresAt <= new Date() });
  if (provider.state === 'pending') return result(attempt, provider.redirectUrl);
  if (provider.state !== 'paid' && provider.state !== 'failed') throw new Error('Invalid card-payment state');

  const keys = bookingKeys(attempt.lines.map((line) => line.item), attempt.borrower);
  try {
    const current = await transactBooking(keys, async (session) => {
      const record = await CheckoutAttempt.findById(attempt._id).session(session);
      if (record.status !== 'awaiting_payment') return record;
      if (provider.state === 'failed') {
        return stopAttempt(record, 'failed', 'The payment failed or expired', session);
      }
      if (!provider.reference || provider.amountMinor !== record.amountMinor ||
        String(provider.currency).toUpperCase() !== record.currency) {
        throw ApiError.conflict('The payment did not match the checkout total');
      }
      const actor = await loadActor(record.borrower, session);
      const entitlements = await getEntitlements(actor, new Date(), session, deps);
      await assertCapacity(actor, record.lines.length, entitlements, session, record._id);
      for (const line of record.lines) {
        normalizeRange(line, { booking: true });
        const item = await loadBookableItem(line.item, actor, line, entitlements, deps, {
          session, excludeAttemptId: record._id,
        });
        if (!item.owner.equals(line.lender) || (line.fulfilment.method === 'delivery' && !item.delivery.offered)) {
          throw ApiError.conflict('The listing or delivery option changed');
        }
      }
      record.paymentReference = provider.reference;
      const recordPayment = requireFeature(deps.payment, 'recordCardCheckout', 'Card payment audit');
      await recordPayment({ ...paymentInput(record), paymentReference: provider.reference }, session);
      return createReservations(record, deps, session);
    });
    return current.status === 'refund_due' ? refundFailed(current, deps) : result(current);
  } catch (error) {
    if (provider.state !== 'paid' || !error.status || error.status >= 500) throw error;
    // Abort the entire booking transaction before recording a compensation request.
    const current = await transactBooking(keys, async (session) => {
      const record = await CheckoutAttempt.findById(attempt._id).session(session);
      if (record.status !== 'awaiting_payment') return record;
      record.paymentReference = provider.reference;
      return stopAttempt(record, 'refund_due', error.message, session);
    });
    return current.status === 'refund_due' ? refundFailed(current, deps) : result(current);
  }
}

async function stopAttempt(record, status, failure, session) {
  await ReservationHold.deleteMany({ attempt: record._id }, { session });
  record.status = status;
  record.failure = failure;
  await record.save({ session });
  return record;
}

async function refundFailed(record, deps) {
  const refund = requireFeature(deps.payment, 'refundFailedCheckout', 'Checkout refund processing');
  const compensation = await refund({ ...paymentInput(record), paymentReference: record.paymentReference });
  if (compensation?.state === 'pending') {
    await CheckoutAttempt.updateOne({ _id: record._id, status: 'refund_due' }, { $set: { updatedAt: new Date() } });
    return result(await CheckoutAttempt.findById(record._id));
  }
  await CheckoutAttempt.updateOne({ _id: record._id, status: 'refund_due' }, { $set: { status: 'failed' } });
  return result(await CheckoutAttempt.findById(record._id));
}

async function status(borrower, attemptId, deps = features()) {
  const record = await CheckoutAttempt.findOne({ _id: objectId(attemptId), borrower });
  if (!record) throw ApiError.notFound('Checkout not found');
  return ['awaiting_payment', 'refund_due'].includes(record.status) ? reconcileCard(record._id, deps) : result(record);
}

async function reconcileExpired(deps = features()) {
  if (!deps.payment?.getCardPayment) return;
  const records = await CheckoutAttempt.find({
    $or: [{ status: 'refund_due' }, { status: 'awaiting_payment', expiresAt: { $lte: new Date() } }],
  }).sort('updatedAt _id').limit(50).select('_id');
  for (const record of records) {
    try {
      await reconcileCard(record._id, deps);
    } catch (error) {
      console.error('Could not reconcile checkout', String(record._id), error.message);
      await CheckoutAttempt.updateOne({ _id: record._id }, { $set: { updatedAt: new Date() } });
    }
  }
}

module.exports = { preview, begin, status, reconcileCard, reconcileExpired };
