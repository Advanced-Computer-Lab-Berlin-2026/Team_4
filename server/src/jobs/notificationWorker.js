const EventOutbox = require('../models/EventOutbox');
const { processEvent } = require('../services/notifications/notification');

const MAX_ATTEMPTS = 10;
const MAX_BACKOFF_MS = 60 * 1000;
const LEASE_MS = 60 * 1000;
let timer = null;
let running = false;

function retryDelay(attempt) {
  return Math.min(1000 * (2 ** Math.max(attempt - 1, 0)), MAX_BACKOFF_MS);
}

async function processNextEvent(now = new Date()) {
  const event = await EventOutbox.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', availableAt: { $lte: now } },
        { status: 'processing', lockedAt: { $lte: new Date(now.getTime() - LEASE_MS) } },
      ],
    },
    { $set: { status: 'processing', lockedAt: now }, $inc: { attempts: 1 } },
    { new: true, sort: { createdAt: 1 } }
  );
  if (!event) return false;

  try {
    await processEvent(event);
    await EventOutbox.updateOne(
      { _id: event._id, status: 'processing' },
      { $set: { status: 'sent', sentAt: new Date(), lockedAt: null, lastError: null } }
    );
  } catch (error) {
    const failed = event.attempts >= MAX_ATTEMPTS;
    const update = {
      status: failed ? 'failed' : 'pending',
      lockedAt: null,
      lastError: String(error.message || error).slice(0, 2000),
    };
    if (failed) update.failedAt = new Date();
    else update.availableAt = new Date(Date.now() + retryDelay(event.attempts));
    await EventOutbox.updateOne({ _id: event._id, status: 'processing' }, { $set: update });
    console.error(`[notification-worker] event ${event.eventKey} ${failed ? 'failed' : 'will retry'}: ${error.message || error}`);
  }
  return true;
}

function startNotificationWorker({ pollIntervalMs = 1000 } = {}) {
  if (timer || process.env.NODE_ENV === 'test') return timer;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await processNextEvent();
    } catch (error) {
      console.error(`[notification-worker] poll failed: ${error.message || error}`);
    } finally {
      running = false;
    }
  };
  timer = setInterval(poll, pollIntervalMs);
  timer.unref();
  void poll();
  return timer;
}

module.exports = { processNextEvent, startNotificationWorker, retryDelay, MAX_ATTEMPTS };
