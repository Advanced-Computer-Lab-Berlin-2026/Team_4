const fs = require('node:fs');
const path = require('node:path');
const ApiError = require('../../utils/ApiError');

function optionalFeature(relativePath) {
  const filename = path.join(__dirname, '..', relativePath + '.js');
  return fs.existsSync(filename) ? require(filename) : undefined;
}

function features() {
  return {
    payment: optionalFeature('payments/payment'),
    policy: optionalFeature('policies/bookingPolicy'),
    pricing: optionalFeature('pricing/depositQuote'),
    membership: optionalFeature('membership/entitlements'),
    promo: optionalFeature('promotions/promo'),
    trust: optionalFeature('reviews/trust'),
    events: optionalFeature('notifications/eventOutbox'),
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
  if (!events?.enqueueEvent) return;
  const id = String(reservation._id);
  const recipients = [reservation.borrower, reservation.lender].map(String);
  const payload = {
    reservationId: id, itemId: String(reservation.item), borrowerId: String(reservation.borrower), status,
    startDate: reservation.startDate, endDate: reservation.endDate,
    returnedAt: reservation.returnedAt, completedAt: reservation.completedAt,
    returnCondition: reservation.returnCondition,
  };
  if (CHECKOUT_EVENTS[status]) {
    await events.enqueueEvent(CHECKOUT_EVENTS[status], id, recipients, payload, id + ':' + status, session);
  }
  if (['cancelled', 'rejected', 'completed'].includes(status)) {
    await events.enqueueEvent('availability_changed', id, recipients, payload, id + ':availability:' + status, session);
  }
}

function stripeWebhook(req, res, next) {
  const checkout = require('../reservations/checkout');
  const verify = requireFeature(features().payment, 'verifyCheckoutWebhook', 'Stripe webhook integration');
  Promise.resolve().then(async () => {
    const attemptId = await verify(req.body, req.get('Stripe-Signature'));
    if (attemptId) await checkout.reconcileCard(attemptId);
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
