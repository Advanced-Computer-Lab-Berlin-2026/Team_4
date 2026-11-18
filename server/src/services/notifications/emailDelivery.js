const { sendEmail } = require('../../utils/email');
const Notification = require('../../models/Notification');

async function deliverNotification(notification, user, event) {
  if (notification.email.sent || notification.email.status === 'sent' || notification.email.status === 'skipped') return notification;

  const enabled = user.notificationPrefs
    ? user.notificationPrefs[notification.category] !== false
    : true;
  if (!enabled) {
    notification.email.status = 'skipped';
    notification.email.sent = false;
    await notification.save();
    return notification;
  }
  try {
    if (!user.email) throw new Error(`User ${user._id} has no email address`);
    await sendEmail({
      to: user.email,
      subject: event.payload.emailSubject || notification.title,
      text: event.payload.emailText || notification.message || notification.title,
    });
    notification.email.status = 'sent';
    notification.email.sent = true;
    notification.email.sentAt = new Date();
    notification.email.failedAt = undefined;
    notification.email.lastError = undefined;
    await notification.save();
    return notification;
  } catch (error) {
    notification.email.status = 'failed';
    notification.email.sent = false;
    notification.email.failedAt = new Date();
    notification.email.lastError = error.message;
    await notification.save();
    throw error;
  }
}

async function createOrDeliver(user, event, details) {
  const notification = await Notification.findOneAndUpdate(
    { user: user._id, eventKey: event.eventKey },
    {
      $setOnInsert: {
        user: user._id,
        eventKey: event.eventKey,
        type: event.type,
        category: details.category,
        title: event.payload.title || details.title,
        message: event.payload.message || details.message,
        link: event.payload.link || details.link,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await deliverNotification(notification, user, event);
}

module.exports = { deliverNotification, createOrDeliver };
