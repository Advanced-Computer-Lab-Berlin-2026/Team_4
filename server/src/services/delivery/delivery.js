const mongoose = require('mongoose');
const { Item, Reservation } = require('../../models');
const ApiError = require('../../utils/ApiError');
const commands = require('../reservations/reservationCommands');

const nextStatus = { preparing: 'out_for_delivery', out_for_delivery: 'delivered' };
const dispatchable = ['confirmed', 'active'];
const pageSize = 20;

function objectId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw ApiError.badRequest('Invalid ID');
  return value;
}

function deliverySettings(item) {
  return { id: String(item._id), offered: Boolean(item.delivery?.offered), fee: item.delivery?.fee ?? 0 };
}

function parseSettings({ offered, fee } = {}) {
  if (typeof offered !== 'boolean') throw ApiError.badRequest('Choose whether delivery is offered');
  if (!offered) return { offered, fee: 0 };
  const minor = typeof fee === 'number' ? Math.round(fee * 100) : NaN;
  if (!Number.isSafeInteger(minor) || minor < 0 || fee !== minor / 100) {
    throw ApiError.badRequest('Enter a nonnegative delivery fee with up to two decimal places');
  }
  return { offered, fee };
}

async function getItemSettings(itemId, actorId) {
  const item = await Item.findOne({
    _id: objectId(itemId), $or: [Item.publicFilter(), { owner: actorId }],
  }).select('delivery').lean();
  if (!item) throw ApiError.notFound('Item not found');
  return deliverySettings(item);
}

async function setItemSettings(itemId, actor, input) {
  if (!actor.isVerifiedLender()) throw ApiError.forbidden('Only verified lenders can change delivery settings');
  const { offered, fee } = parseSettings(input);
  const item = await Item.findOneAndUpdate({ _id: objectId(itemId), owner: actor._id }, {
    $set: { 'delivery.offered': offered, 'delivery.fee': fee },
  }, { new: true, runValidators: true }).select('delivery').lean();
  if (!item) throw ApiError.notFound('Item not found');
  return deliverySettings(item);
}

function participant(actor) {
  return { $or: [{ borrower: actor._id }, { lender: actor._id }] };
}

function trackingView(reservation, actor, includeAddress = false) {
  const { fulfilment, item, lender, status } = reservation;
  const deliveryStatus = commands.deliveryStage(reservation);
  return {
    id: String(reservation._id),
    itemId: String(item?._id || item || ''),
    title: item?.title ?? 'Unavailable listing',
    method: fulfilment.method,
    deliveryStatus, reservationStatus: status, deliveryFee: fulfilment.deliveryFee ?? 0,
    canUpdate: String(lender) === String(actor._id) && actor.isVerifiedLender() &&
      dispatchable.includes(status) && Boolean(nextStatus[deliveryStatus]),
    ...(includeAddress && { deliveryAddress: fulfilment.deliveryAddress }),
  };
}

async function listTracking(actor, page) {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw ApiError.badRequest('Invalid page');
  const rows = await Reservation.find({ ...participant(actor), 'fulfilment.method': 'delivery' })
    .select('item lender status fulfilment.method fulfilment.deliveryStatus fulfilment.deliveryFee')
    .populate('item', 'title').sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize).limit(pageSize + 1).lean();
  return { items: rows.slice(0, pageSize).map((row) => trackingView(row, actor)), hasNext: rows.length > pageSize };
}

async function findDelivery(reservationId, actor) {
  const reservation = await Reservation.findOne({
    _id: objectId(reservationId), ...participant(actor), 'fulfilment.method': 'delivery',
  }).populate('item', 'title');
  if (!reservation) throw ApiError.notFound('Delivery reservation not found');
  return reservation;
}

async function getTracking(reservationId, actor) {
  return trackingView(await findDelivery(reservationId, actor), actor, true);
}

async function setTracking(reservationId, actor, deliveryStatus) {
  await commands.advanceDelivery({ reservationId: objectId(reservationId), actorId: actor._id, deliveryStatus });
  return getTracking(reservationId, actor);
}

module.exports = { getItemSettings, setItemSettings, getTracking, listTracking, setTracking };
