const Reservation = require('../../models/Reservation');
const User = require('../../models/User');
const { enqueueEvent } = require('./eventOutbox');

const utcDate = (date) => date.toISOString().slice(0, 10);

async function enqueueDueReturnReminders(now = new Date()) {
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const reservations = await Reservation.find({
    status: { $in: ['confirmed', 'active'] },
    endDate: { $gt: now, $lte: until },
  }).select('_id borrower endDate');

  for (const reservation of reservations) {
    const date = utcDate(reservation.endDate);
    await enqueueEvent(
      'return_reminder',
      reservation._id,
      [reservation.borrower],
      { title: 'Upcoming return reminder', message: 'Your reservation is due to be returned within 24 hours.', link: '/reservations' },
      `reminder:return:${reservation._id}:${date}`
    );
  }
  return reservations.length;
}

async function enqueueMembershipReminders(now = new Date()) {
  const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const users = await User.find({
    'membership.status': 'active',
    'membership.renewsAt': { $gt: now, $lte: until },
  }).select('_id membership.renewsAt');

  for (const user of users) {
    const date = utcDate(user.membership.renewsAt);
    await enqueueEvent(
      'membership_expiring',
      user._id,
      [user._id],
      { title: 'Membership renewal reminder', message: 'Your membership renews within 7 days.', link: '/account/membership' },
      `reminder:membership:${user._id}:${date}`
    );
  }
  return users.length;
}

async function enqueueDueReminders(now = new Date()) {
  const [returns, memberships] = await Promise.all([
    enqueueDueReturnReminders(now),
    enqueueMembershipReminders(now),
  ]);
  return { returns, memberships };
}

module.exports = { enqueueDueReturnReminders, enqueueMembershipReminders, enqueueDueReminders, utcDate };
