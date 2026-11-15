const EventOutbox = require('../../models/EventOutbox');

async function enqueueEvent(type, aggregateId, recipients, payload, eventKey, session = null) {
  if (!type || !aggregateId || !Array.isArray(recipients) || !eventKey) {
    throw new TypeError('type, aggregateId, recipients, and eventKey are required');
  }

  try {
    const [event] = await EventOutbox.create([{
      type,
      aggregateId,
      recipients,
      payload: payload || {},
      eventKey,
    }], session ? { session } : undefined);
    return event;
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await EventOutbox.findOne({ eventKey }).session(session);
    if (!existing) throw error;
    return existing;
  }
}

module.exports = { enqueueEvent };
