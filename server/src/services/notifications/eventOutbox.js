const EventOutbox = require('../../models/EventOutbox');

async function enqueueEvent(type, aggregateId, recipients, payload, eventKey, session = null) {
  if (!type || !aggregateId || !Array.isArray(recipients) || !eventKey) {
    throw new TypeError('type, aggregateId, recipients, and eventKey are required');
  }

  const createdAt = new Date();
  const event = { type, aggregateId, recipients, payload: payload || {}, eventKey, createdAt, updatedAt: createdAt };
  try {
    return await EventOutbox.findOneAndUpdate(
      { eventKey }, { $setOnInsert: event }, { upsert: true, new: true, session, timestamps: false },
    );
  } catch (error) {
    if (session?.inTransaction() || error.code !== 11000) throw error;
    const existing = await EventOutbox.findOne({ eventKey }).session(session);
    if (!existing) throw error;
    return existing;
  }
}

module.exports = { enqueueEvent };
