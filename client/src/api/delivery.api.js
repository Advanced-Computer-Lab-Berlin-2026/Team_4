import api from './axios';

export async function getDeliveryOffer(itemId, signal) {
  return (await api.get(`/delivery/items/${encodeURIComponent(itemId)}`, { signal })).data.item;
}

export async function setDeliveryOffer(itemId, offer) {
  return (await api.patch(`/delivery/items/${encodeURIComponent(itemId)}`, offer)).data.item;
}

export async function listDeliveries(page, signal) {
  return (await api.get('/delivery/reservations', { params: { page }, signal })).data;
}

export async function getDeliveryStatus(reservationId, signal) {
  return (await api.get(`/delivery/reservations/${encodeURIComponent(reservationId)}`, { signal })).data.reservation;
}

export async function setDeliveryStatus(reservationId, deliveryStatus) {
  return (await api.patch(`/delivery/reservations/${encodeURIComponent(reservationId)}`, { deliveryStatus })).data.reservation;
}
