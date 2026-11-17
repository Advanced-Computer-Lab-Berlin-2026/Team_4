const { ChatMessage } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { objectId } = require('../reservations/availability');
const { getParticipantReservation, withReservation } = require('../reservations/reservationCommands');

function assertChatOpen(reservation) {
  if (!['pending', 'confirmed', 'active'].includes(reservation.status) || (reservation.status !== 'active' && reservation.endDate <= new Date())) {
    throw ApiError.conflict('Chat is available for upcoming and active reservations');
  }
}

function messageView(message) {
  return {
    id: String(message._id), senderId: String(message.sender),
    text: message.text, createdAt: message.createdAt,
  };
}

async function listMessages(actorId, reservationId, before) {
  const reservation = await getParticipantReservation(actorId, reservationId);
  assertChatOpen(reservation);
  const query = { reservation: reservation._id };
  if (before != null) query._id = { $lt: objectId(before) };
  const rows = await ChatMessage.find(query).sort({ _id: -1 }).limit(51);
  return { items: rows.slice(0, 50).reverse().map(messageView), hasEarlier: rows.length > 50 };
}

async function sendMessage(actorId, reservationId, text) {
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) {
    throw ApiError.badRequest('Enter a message of 1–2000 characters');
  }
  return withReservation({ actorId, reservationId }, async (reservation, actor, session) => {
    assertChatOpen(reservation);
    const [message] = await ChatMessage.create([{
      reservation: reservation._id, sender: actor._id, text,
    }], { session });
    return messageView(message);
  });
}

module.exports = { listMessages, sendMessage };
