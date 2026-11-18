const User = require('../../models/User');
const Reservation = require('../../models/Reservation');
const WaitlistEntry = require('../../models/WaitlistEntry');
const ReservationHold = require('../../models/ReservationHold');
const { createOrDeliver } = require('./emailDelivery');
const { rewardForFirstCompletion } = require('../referrals/referral');

const EVENT_DETAILS = {
  confirmed: ['reservations', 'Reservation confirmed', 'Your reservation has been confirmed.', '/reservations'],
  cancelled: ['reservations', 'Reservation cancelled', 'A reservation has been cancelled.', '/reservations'],
  rejected: ['reservations', 'Reservation rejected', 'A reservation request was rejected.', '/reservations'],
  picked_up: ['reservations', 'Item picked up', 'An item has been picked up.', '/reservations'],
  returned: ['reservations', 'Item returned', 'An item has been returned.', '/reservations'],
  completed: ['reservations', 'Reservation completed', 'A reservation has been completed.', '/reservations'],
  availability_changed: ['promotions', 'A favorite is available', 'An item you favorited is available again.', '/favorites'],
  damage_decision: ['reservations', 'Damage decision updated', 'A damage report decision has been made.', '/reservations'],
  damage_resolved: ['reservations', 'Damage report resolved', 'A damage report has been resolved.', '/reservations'],
  delivery_status: ['reservations', 'Delivery status updated', 'Your reservation delivery status has changed.', '/reservations'],
  waitlist_promoted: ['promotions', 'Waitlist update', 'A place is available for an item on your waitlist.', '/waitlists'],
  membership_changed: ['system', 'Membership updated', 'Your membership has been updated.', '/account/membership'],
  membership_expiring: ['system', 'Membership renewal reminder', 'Your membership expires soon.', '/membership'],
  return_reminder: ['reservations', 'Upcoming return reminder', 'Your reservation is due to be returned within 24 hours.', '/reservations'],
  notice_posted: ['communityNotices', 'New community notice', 'A new community notice was posted.', '/notices'],
};

function getDetails(event) {
  const details = EVENT_DETAILS[event.type];
  if (!details) throw new Error(`Unsupported notification event type: ${event.type}`);
  return {
    category: event.payload.category || details[0],
    title: details[1],
    message: details[2],
    link: details[3],
  };
}

async function eventIsCurrent(event, now) {
  const { dueAt, renewsAt, holdId } = event.payload;
  if (event.type === 'return_reminder' && dueAt) {
    return Boolean(await Reservation.exists({
      _id: event.aggregateId, status: { $in: ['confirmed', 'active'] }, endDate: { $eq: new Date(dueAt), $gt: now },
    }));
  }
  if (event.type === 'membership_expiring' && renewsAt) {
    return Boolean(await User.exists({
      _id: event.aggregateId, 'membership.status': 'active', 'membership.renewsAt': { $eq: new Date(renewsAt), $gt: now },
    }));
  }
  if (event.type === 'waitlist_promoted' && holdId) {
    const entry = await WaitlistEntry.exists({
      _id: event.aggregateId, holdId, status: 'promoted', offerExpiresAt: { $gt: now },
    });
    return Boolean(entry && await ReservationHold.exists({ _id: holdId, expiresAt: { $gt: now } }));
  }
  return true;
}

async function processReferral(event) {
  if (event.type !== 'completed') return;
  const reservation = await Reservation.findById(event.aggregateId).select('borrower status').lean();
  if (reservation?.status === 'completed') await rewardForFirstCompletion(reservation.borrower, reservation._id);
}

async function notifyRecipients(event, details) {
  const recipientIds = [...new Set(event.recipients.map(String))];
  const users = await User.find({ _id: { $in: recipientIds }, role: 'member', status: 'active' });
  const failures = [];
  for (let index = 0; index < users.length; index += 5) {
    const results = await Promise.allSettled(users.slice(index, index + 5).map((user) => createOrDeliver(user, event, details)));
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
  }
  if (failures.length) throw failures[0];
}

async function processEvent(event) {
  const details = getDetails(event);
  if (!(await eventIsCurrent(event, new Date()))) return;
  const results = await Promise.allSettled([processReferral(event), notifyRecipients(event, details)]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}

module.exports = { processEvent, getDetails, EVENT_DETAILS };
