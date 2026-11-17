// Member 2 - card payments with Stripe's hosted payment page (Req 51, NFR 4). Called by Member 1's checkout
// (docs/SPRINT2_CONTRACT.md) and, for memberships, by Member 8.
//
//   startCardPayment  -> creates (or resumes) Stripe's payment page and returns its URL
//   getCardPayment    -> asks STRIPE whether it was paid (the browser is never trusted)
//   recordCardCheckout-> after a verified payment: audit rows per reservation, in M1's booking transaction
//   verifyCheckoutWebhook -> checks Stripe's signature and says which checkout to look at
//   refundFailedCheckout  -> paid, but the booking could not be made: refund the card, exactly once
//
// Exactly-once: each card payment is one PaymentOperation (unique idempotencyKey), and every Stripe call that
// creates something sends a Stripe idempotency key, so a retry or a duplicate webhook can never pay or refund twice.
// No Stripe call runs inside a database transaction (network calls would hold the transaction open).
const mongoose = require('mongoose');
const PaymentOperation = require('../../models/PaymentOperation');
const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const stripe = require('./stripe');
const audit = require('./audit');
const { runOperation, checkReference, hashRequest } = require('./operation');
const { assertAmountMinor, assertCurrency } = require('./money');

const MINUTE_MS = 60 * 1000;
// Pages other members may ask Stripe to return to (never taken from the browser). Checkout uses its own status page.
const RETURN_PATHS = ['/membership'];

/** The checkout lines must be valid and add up to the total - shared with the wallet checkout (payment.js). */
function assertCheckoutLines(lines, amountMinor) {
  if (!Array.isArray(lines) || lines.length === 0) throw ApiError.badRequest('The checkout has no lines');
  for (const line of lines) {
    if (!mongoose.isValidObjectId(line.reservationId)) throw ApiError.badRequest('Each line needs a reservationId');
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0) throw ApiError.badRequest('Invalid line amount');
  }
  if (lines.reduce((sum, line) => sum + line.amountMinor, 0) !== amountMinor) {
    throw ApiError.badRequest('The checkout total does not match its lines');
  }
}

/** Turn a checkout (M1) or membership (M8) request into one checked description of the payment. */
function cardSpec(input) {
  const { idempotencyKey, amountMinor } = input || {};
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw ApiError.badRequest('idempotencyKey is required');
  assertAmountMinor(amountMinor);
  const currency = assertCurrency(input.currency);
  const purpose = input.purpose || 'deposit';

  let spec;
  if (purpose === 'deposit') {
    assertCheckoutLines(input.lines, amountMinor);
    spec = {
      userId: input.borrowerId,
      reference: { type: 'checkout', id: input.attemptId },
      items: input.lines.filter((l) => l.amountMinor > 0).map((l) => ({ name: l.title || 'Reservation deposit', amountMinor: l.amountMinor })),
      returnPath: `/checkout/status/${input.attemptId}`,
    };
  } else if (purpose === 'membership') {
    const returnPath = input.returnPath || '/membership';
    if (!RETURN_PATHS.includes(returnPath)) throw ApiError.badRequest('Unknown return page');
    if (input.reference?.type !== 'membership') throw ApiError.badRequest("reference.type must be 'membership'");
    spec = { userId: input.userId, reference: input.reference, items: [{ name: input.title || 'ShareShed membership', amountMinor }], returnPath };
  } else {
    throw ApiError.badRequest("purpose must be 'deposit' or 'membership'");
  }
  if (!mongoose.isValidObjectId(spec.userId)) throw ApiError.badRequest('A valid user id is required');
  checkReference(spec.reference);
  return { ...spec, idempotencyKey, amountMinor, currency, purpose, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null };
}

const cardHash = (spec) => hashRequest({ kind: 'card_payment', ...spec });

/** The PaymentOperation for this card payment - created once, found again on every retry. */
async function findOrCreateCardOp(spec) {
  let op = await PaymentOperation.findOne({ idempotencyKey: spec.idempotencyKey });
  if (!op) {
    // Stripe keeps a page open 30 min - 24 h. Fixed here once, so a retried create sends the identical request.
    const earliest = Date.now() + 31 * MINUTE_MS;
    const wanted = spec.expiresAt && !Number.isNaN(spec.expiresAt.getTime()) ? spec.expiresAt.getTime() : earliest;
    const expiresAt = new Date(Math.min(Math.max(wanted, earliest), Date.now() + 23 * 60 * MINUTE_MS));
    try {
      op = await PaymentOperation.create({
        idempotencyKey: spec.idempotencyKey, kind: 'card_payment', purpose: spec.purpose, user: spec.userId,
        reference: spec.reference, amountMinor: spec.amountMinor, currency: spec.currency, requestHash: cardHash(spec),
        status: 'pending', stripe: { expiresAt, returnPath: spec.returnPath },
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      op = await PaymentOperation.findOne({ idempotencyKey: spec.idempotencyKey }); // a parallel request created it
    }
  }
  if (op.kind !== 'card_payment' || op.requestHash !== cardHash(spec)) {
    throw ApiError.conflict('This idempotency key was already used for a different payment');
  }
  return op;
}

const paymentIntentId = (session) => (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id);

/**
 * Ask Stripe for the truth about this operation's payment page and remember the outcome.
 * closeExpired: our hold has ended - close the page first, so it can no longer be paid, then report.
 */
async function readState(op, { closeExpired = false } = {}) {
  if (op.status === 'succeeded') return { state: 'paid', ...op.result };
  if (op.status === 'failed') return { state: 'failed' };
  const api = stripe.client();

  if (!op.stripe?.sessionId) {
    if (!closeExpired) return { state: 'pending' };
    // The page was never created. Close the operation so a late start cannot open one.
    const { modifiedCount } = await PaymentOperation.updateOne(
      { _id: op._id, status: 'pending', 'stripe.sessionId': { $exists: false } }, { $set: { status: 'failed', completedAt: new Date() } }
    );
    if (modifiedCount === 1) return { state: 'failed' };
    return readState(await PaymentOperation.findById(op._id), { closeExpired });
  }

  let session = await api.checkout.sessions.retrieve(op.stripe.sessionId);
  if (session.status === 'open' && closeExpired) {
    try {
      session = await api.checkout.sessions.expire(session.id);
    } catch (err) {
      session = await api.checkout.sessions.retrieve(op.stripe.sessionId); // it was paid a moment ago
    }
  }

  if (session.payment_status === 'paid') {
    const result = { reference: paymentIntentId(session), amountMinor: session.amount_total, currency: String(session.currency).toUpperCase() };
    await PaymentOperation.updateOne(
      { _id: op._id, status: 'pending' },
      { $set: { status: 'succeeded', result, stripePaymentIntentId: result.reference, completedAt: new Date() } }
    );
    return { state: 'paid', ...result };
  }
  if (session.status === 'expired') {
    await PaymentOperation.updateOne({ _id: op._id, status: 'pending' }, { $set: { status: 'failed', completedAt: new Date() } });
    return { state: 'failed' };
  }
  // 'open' (borrower still on the page) or 'complete' but the bank has not confirmed yet.
  return session.status === 'open' ? { state: 'pending', redirectUrl: session.url } : { state: 'pending' };
}

/**
 * startCardPayment(input) -> { state:'pending', redirectUrl } (or the final state if it already ended).
 * Checkout input (M1): { attemptId, borrowerId, idempotencyKey, amountMinor, currency, expiresAt, lines }.
 * Membership input (M8): { purpose:'membership', userId, reference:{ type:'membership', id }, amountMinor, currency,
 *                          idempotencyKey, title?, returnPath?: '/membership' }.
 */
async function startCardPayment(input) {
  const spec = cardSpec(input);
  const api = stripe.client();
  let op = await findOrCreateCardOp(spec);
  if (op.status !== 'pending' || op.stripe?.sessionId) return readState(op);

  const metadata = {
    kind: spec.purpose === 'deposit' ? 'checkout' : 'membership',
    operationId: String(op._id),
    ...(spec.purpose === 'deposit' && { attemptId: String(spec.reference.id) }),
  };
  const returnUrl = env.CLIENT_URL + op.stripe.returnPath;
  // Same Stripe idempotency key on every retry: Stripe returns the SAME page instead of creating a second one.
  const session = await api.checkout.sessions.create({
    mode: 'payment',
    line_items: spec.items.map((item) => ({
      quantity: 1,
      price_data: { currency: spec.currency.toLowerCase(), unit_amount: item.amountMinor, product_data: { name: item.name.slice(0, 200) } },
    })),
    success_url: returnUrl,
    cancel_url: returnUrl,
    expires_at: Math.floor(op.stripe.expiresAt.getTime() / 1000),
    client_reference_id: String(spec.reference.id),
    metadata,
    payment_intent_data: { metadata },
  }, { idempotencyKey: `${spec.idempotencyKey}:session` });

  op = await PaymentOperation.findOneAndUpdate(
    { _id: op._id, status: 'pending' },
    { $set: { 'stripe.sessionId': session.id, 'stripe.url': session.url } },
    { new: true }
  );
  if (!op) {
    // The hold ended while the page was being created: close the page so it can never be paid.
    await api.checkout.sessions.expire(session.id).catch(() => {});
    return { state: 'failed' };
  }
  return readState(op);
}

/**
 * getCardPayment(input) -> { state:'pending', redirectUrl? } | { state:'failed' } | { state:'paid', reference, amountMinor, currency }
 * input: the same checkout input + closeExpired. The amount Stripe really took is reported as it is; M1 compares it.
 */
async function getCardPayment(input) {
  const { idempotencyKey, closeExpired = false } = input || {};
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw ApiError.badRequest('idempotencyKey is required');
  const op = await PaymentOperation.findOne({ idempotencyKey });
  if (!op) return closeExpired ? { state: 'failed' } : { state: 'pending' }; // never started
  if (op.kind !== 'card_payment') throw ApiError.conflict('This is not a card payment');
  return readState(op, { closeExpired });
}

/** The verified card payment behind `paymentReference`, which must belong to this checkout/membership. */
async function verifiedCardPayment({ paymentReference, reference, userId, purpose }, session) {
  if (typeof paymentReference !== 'string' || !paymentReference) throw ApiError.badRequest('paymentReference is required');
  const op = await PaymentOperation.findOne({ kind: 'card_payment', stripePaymentIntentId: paymentReference }).session(session || null).lean();
  if (!op || op.status !== 'succeeded' || op.purpose !== purpose ||
    String(op.reference?.id) !== String(reference.id) || String(op.user) !== String(userId)) {
    throw ApiError.conflict('No verified card payment matches this request');
  }
  return op;
}

/**
 * recordCardCheckout(input, session) - in M1's booking transaction, after getCardPayment said 'paid'.
 * One audit row per reservation (NFR 14), like the wallet checkout. The wallet is not touched: the card paid.
 * input: the checkout input + paymentReference.
 */
async function recordCardCheckout(input, session) {
  const { attemptId, borrowerId, idempotencyKey, amountMinor, currency, lines, paymentReference } = input || {};
  assertAmountMinor(amountMinor);
  assertCheckoutLines(lines, amountMinor);
  const reference = { type: 'checkout', id: attemptId };
  checkReference(reference);

  return runOperation({ idempotencyKey: `${idempotencyKey}:record`, kind: 'charge', purpose: 'deposit', userId: borrowerId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    const card = await verifiedCardPayment({ paymentReference, reference, userId: borrowerId, purpose: 'deposit' }, s);
    if (card.result.amountMinor !== amountMinor) throw ApiError.conflict('The payment did not match the checkout total');
    for (const line of lines.filter((l) => l.amountMinor > 0)) {
      await audit.record({
        action: 'deposit_charged', reservationId: line.reservationId, userId: borrowerId, amountMinor: line.amountMinor, operationId: operation._id,
        inputs: {
          method: 'card', paymentReference, checkoutAttemptId: attemptId, itemId: line.itemId, startDate: line.startDate, endDate: line.endDate,
          deposit: line.deposit, fulfilmentMethod: line.fulfilment?.method, lineAmountMinor: line.amountMinor,
        },
        result: { chargedMinor: line.amountMinor },
      }, { session: s });
    }
    return { recordedMinor: amountMinor, paymentReference };
  }, session);
}

/**
 * verifyCheckoutWebhook(rawBody, signature) -> attemptId | null.
 * Checks Stripe's signature first (a fake request gets 400). Only checkout pages return an id; anything else -> null.
 */
async function verifyCheckoutWebhook(rawBody, signature) {
  const api = stripe.client();
  let event;
  try {
    event = api.webhooks.constructEvent(rawBody, signature, stripe.webhookSecret());
  } catch (err) {
    throw ApiError.badRequest('Invalid Stripe webhook signature');
  }
  if (!String(event?.type).startsWith('checkout.session.')) return null;
  const metadata = event.data?.object?.metadata || {};
  return metadata.kind === 'checkout' && mongoose.isValidObjectId(metadata.attemptId) ? metadata.attemptId : null;
}

/**
 * refundFailedCheckout(input) - the card was charged but the booking failed (or Stripe took a different amount).
 * Refunds the WHOLE Stripe payment to the card. Safe to retry from any server: one PaymentOperation per checkout
 * and Stripe's idempotency key mean the card is refunded once.
 * input: the checkout input + paymentReference.
 */
async function refundFailedCheckout(input) {
  const { attemptId, borrowerId, idempotencyKey, currency, paymentReference } = input || {};
  const reference = { type: 'checkout', id: attemptId };
  checkReference(reference);
  const card = await verifiedCardPayment({ paymentReference, reference, userId: borrowerId, purpose: 'deposit' });
  const paidMinor = card.result.amountMinor;
  const key = `${idempotencyKey}:refund`;
  const spec = { kind: 'refund', purpose: 'deposit', userId: borrowerId, reference, amountMinor: paidMinor, currency: assertCurrency(currency) };

  let op = await PaymentOperation.findOne({ idempotencyKey: key });
  if (!op) {
    try {
      op = await PaymentOperation.create({ idempotencyKey: key, ...spec, user: borrowerId, requestHash: hashRequest(spec), status: 'pending' });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      op = await PaymentOperation.findOne({ idempotencyKey: key });
    }
  }
  if (op.status === 'succeeded') return { ...op.result, replayed: true };

  let refund;
  try {
    refund = await stripe.client().refunds.create(
      { payment_intent: paymentReference, metadata: { attemptId: String(attemptId), reason: 'checkout_failed' } },
      { idempotencyKey: key }
    );
  } catch (err) {
    if (err?.code !== 'charge_already_refunded') throw err; // the refund happened earlier - nothing more to do
    refund = { id: null, amount: paidMinor, status: 'succeeded' };
  }
  const result = { refundedMinor: refund.amount, refundId: refund.id, paymentReference };

  await mongoose.connection.transaction(async (s) => {
    const { modifiedCount } = await PaymentOperation.updateOne(
      { _id: op._id, status: 'pending' },
      { $set: { status: 'succeeded', result, 'stripe.refundId': refund.id, completedAt: new Date() } }, { session: s }
    );
    if (modifiedCount !== 1) return; // another server finished it first
    await audit.record({
      action: 'card_payment_refunded', userId: borrowerId, amountMinor: refund.amount, operationId: op._id,
      inputs: { checkoutAttemptId: attemptId, paymentReference, checkoutAmountMinor: input.amountMinor, paidMinor, reason: 'checkout_failed' },
      result,
    }, { session: s });
  });
  return { ...result, replayed: false };
}

/**
 * recordMembershipPayment(input, session) - M8, after getCardPayment said 'paid' for a membership payment page.
 * input: { userId, amountMinor, currency, reference:{ type:'membership', id }, paymentReference, idempotencyKey }
 */
async function recordMembershipPayment(input, session) {
  const { userId, amountMinor, currency, reference, paymentReference, idempotencyKey } = input || {};
  assertAmountMinor(amountMinor);
  if (reference?.type !== 'membership') throw ApiError.badRequest("reference.type must be 'membership'");
  checkReference(reference);

  return runOperation({ idempotencyKey, kind: 'charge', purpose: 'membership', userId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    const card = await verifiedCardPayment({ paymentReference, reference, userId, purpose: 'membership' }, s);
    if (card.result.amountMinor !== amountMinor) throw ApiError.conflict('The payment did not match the membership price');
    await audit.record({
      action: 'membership_charged', userId, amountMinor, operationId: operation._id,
      inputs: { method: 'card', paymentReference, reference }, result: { chargedMinor: amountMinor },
    }, { session: s });
    return { chargedMinor: amountMinor, paymentReference };
  }, session);
}

module.exports = {
  assertCheckoutLines, startCardPayment, getCardPayment, recordCardCheckout, verifyCheckoutWebhook,
  refundFailedCheckout, recordMembershipPayment, RETURN_PATHS,
};
