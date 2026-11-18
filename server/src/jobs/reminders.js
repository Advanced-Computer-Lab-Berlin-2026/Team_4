const { enqueueDueReminders } = require('../services/notifications/reminders');

let timer = null;
let running = false;

function startReminderJobs({ pollIntervalMs = 60 * 1000 } = {}) {
  if (timer || process.env.NODE_ENV === 'test') return timer;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await enqueueDueReminders();
    } catch (error) {
      console.error(`[reminders] poll failed: ${error.message || error}`);
    } finally {
      running = false;
    }
  };
  timer = setInterval(poll, pollIntervalMs);
  timer.unref();
  void poll();
  return timer;
}

module.exports = { startReminderJobs };
