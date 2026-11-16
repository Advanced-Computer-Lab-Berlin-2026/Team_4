const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { Item, Reservation } = require('../../models');
const ApiError = require('../../utils/ApiError');

const nextStatus = { preparing: 'out_for_delivery', out_for_delivery: 'delivered' };
const dispatchable = ['confirmed', 'active'];
const pageSize = 20;
const commandsPath = path.join(__dirname, '../reservations/reservationCommands.js');
const outboxPath = path.join(__dirname, '../notifications/eventOutbox.js');

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
  const current = fulfilment.deliveryStatus;
  // Checkout and existing delivery reservations can leave the initial enum as 'none'.
  const deliveryStatus = current && current !== 'none' ? current : 'preparing';
  return {
    id: String(reservation._id),
    itemId: String(item?._id || item || ''),
    title: item?.title ?? 'Unavailable listing',
    method: fulfilment.method,
    deliveryStatus,
    canUpdate: String(lender) === String(actor._id) && actor.isVerifiedLender() &&
      dispatchable.includes(status) && Boolean(nextStatus[deliveryStatus]),
    ...(includeAddress && { deliveryAddress: fulfilment.deliveryAddress }),
  };
}

async function listTracking(actor, page) {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw ApiError.badRequest('Invalid page');
  const rows = await Reservation.find({ ...participant(actor), 'fulfilment.method': 'delivery' })
    .select('item lender status fulfilment.method fulfilment.deliveryStatus')
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

async function setTracking(reservationId, actor, status) {
  objectId(reservationId);
  if (!Object.values(nextStatus).includes(status)) throw ApiError.badRequest('Invalid delivery status');

  async function update(reservation, currentActor, session) {
    if (reservation.fulfilment?.method !== 'delivery') throw ApiError.notFound('Delivery reservation not found');
    if (!currentActor.isVerifiedLender() || String(reservation.lender) !== String(currentActor._id)) {
      throw ApiError.forbidden('Only the verified lender on this reservation can update delivery');
    }
    const current = trackingView(reservation, currentActor);
    if (current.deliveryStatus === status) return;
    if (!current.canUpdate || nextStatus[current.deliveryStatus] !== status) {
      throw ApiError.conflict('Delivery must progress in order on a confirmed or active reservation');
    }

    const changed = await Reservation.updateOne({
      _id: reservation._id, lender: currentActor._id, status: reservation.status,
      'fulfilment.method': 'delivery',
      'fulfilment.deliveryStatus': current.deliveryStatus === 'preparing' ? { $in: [null, 'none', 'preparing'] } : current.deliveryStatus,
    }, { $set: { 'fulfilment.deliveryStatus': status } }, { runValidators: true, session });
    if (!changed.matchedCount) throw ApiError.conflict('Delivery status changed. Refresh and try again');

    if (session && fs.existsSync(outboxPath)) {
      const { enqueueEvent } = require(outboxPath);
      const id = current.id;
      await enqueueEvent('delivery_status', id, [reservation.borrower, reservation.lender].map(String), {
        reservationId: id, itemId: current.itemId, deliveryStatus: status,
        link: `/delivery-tracking/${id}`,
      }, `${id}:delivery:${status}`, session);
    }
  }

  if (fs.existsSync(commandsPath)) {
    const { withReservation } = require(commandsPath);
    await withReservation({ actorId: actor._id, reservationId }, update);
  } else {
    // The Sprint 1 checkout has the schema but no reservation command layer. The
    // guarded field update above also protects pre-existing records on that branch.
    await update(await findDelivery(reservationId, actor), actor);
  }
  return getTracking(reservationId, actor);
}

module.exports = { getItemSettings, setItemSettings, getTracking, listTracking, setTracking };
