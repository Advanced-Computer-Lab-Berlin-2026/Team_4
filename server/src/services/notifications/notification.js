const User = require('../../models/User');
const Reservation = require('../../models/Reservation');
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
  waitlist_promoted: ['promotions', 'Waitlist update', 'A place is available for an item on your waitlist.', '/waitlist'],
  membership_changed: ['system', 'Membership updated', 'Your membership has been updated.', '/account/membership'],
  membership_expiring: ['system', 'Membership renewal reminder', 'Your membership renewal is coming up.', '/account/membership'],
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

async function processEvent(event) {
  const details = getDetails(event);
  const recipientIds = [...new Set(event.recipients.map(String))];
  if (event.type === 'completed') {
    const reservation = await Reservation.findById(event.aggregateId).select('borrower');
    const userId = event.payload.borrowerId || reservation?.borrower;
    if (userId) await rewardForFirstCompletion(userId, event.aggregateId);
  }

  const users = await User.find({ _id: { $in: recipientIds } });
  for (const user of users) {
    await createOrDeliver(user, event, details);
  }
}

module.exports = { processEvent, getDetails, EVENT_DETAILS };
