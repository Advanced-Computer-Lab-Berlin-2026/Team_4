const fs = require('node:fs');
const path = require('node:path');
const ApiError = require('../../utils/ApiError');

function optionalFeature(relativePath) {
  const filename = path.join(__dirname, '..', relativePath + '.js');
  return fs.existsSync(filename) ? require(filename) : undefined;
}

function features() {
  const outbox = optionalFeature('notifications/eventOutbox');
  return {
    payment: optionalFeature('payments/payment'),
    policy: optionalFeature('policies/bookingPolicy'),
    pricing: optionalFeature('pricing/depositQuote'),
    membership: optionalFeature('membership/entitlements'),
    promo: optionalFeature('promotions/promo'),
    trust: optionalFeature('reviews/trust'),
    referral: optionalFeature('referrals/referral'),
    events: outbox && {
      ...outbox,
      enqueueAvailabilityChanged: optionalFeature('../controllers/favorites.controller')?.enqueueAvailabilityChanged,
    },
  };
}

function requireFeature(module, operation, label) {
  if (typeof module?.[operation] !== 'function') {
    throw new ApiError(503, label + ' is unavailable. Please try again later.');
  }
  return module[operation];
}

const CHECKOUT_EVENTS = {
  cancelled: 'cancelled',
  confirmed: 'confirmed',
  rejected: 'rejected',
  active: 'picked_up',
  completed: 'completed',
};

async function enqueueReservationEvent(events, reservation, status, session) {
  if (!events) return;
  const id = String(reservation._id);
  const recipients = [reservation.borrower, reservation.lender].map(String);
  const payload = {
    reservationId: id, itemId: String(reservation.item), borrowerId: String(reservation.borrower), status,
    startDate: reservation.startDate, endDate: reservation.endDate,
    returnedAt: reservation.returnedAt, completedAt: reservation.completedAt,
    returnCondition: reservation.returnCondition,
  };
  if (events.enqueueEvent && CHECKOUT_EVENTS[status]) {
    await events.enqueueEvent(CHECKOUT_EVENTS[status], id, recipients, payload, id + ':' + status, session);
  }
  if (events.enqueueAvailabilityChanged && ['cancelled', 'rejected', 'completed'].includes(status)) {
    await events.enqueueAvailabilityChanged(
      reservation.item, { itemId: payload.itemId }, id + ':availability:' + status, session,
    );
  }
}

function stripeWebhook(req, res, next) {
  const checkout = require('../reservations/checkout');
  const verify = requireFeature(features().payment, 'verifyCheckoutWebhook', 'Stripe webhook integration');
  Promise.resolve().then(async () => {
    const target = await verify(req.body, req.get('Stripe-Signature'));
    if (typeof target === 'string') await checkout.reconcileCard(target);
    if (target?.membershipOperationId) {
      const membership = optionalFeature('membership/membership');
      const reconcile = requireFeature(membership, 'reconcileCardMembership', 'Membership payment');
      await reconcile(target);
    }
    res.sendStatus(204);
  }).catch(next);
}

function startSprint2Jobs() {
  const checkout = require('../reservations/checkout');
  const worker = optionalFeature('../jobs/notificationWorker');
  const reminders = optionalFeature('../jobs/reminders');
  worker?.startNotificationWorker?.();
  reminders?.startReminders?.();

  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await checkout.reconcileExpired();
    } catch (error) {
      console.error('Checkout reconciliation failed:', error.message);
    } finally {
      running = false;
    }
  }, 15000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { features, requireFeature, enqueueReservationEvent, stripeWebhook, startSprint2Jobs };
