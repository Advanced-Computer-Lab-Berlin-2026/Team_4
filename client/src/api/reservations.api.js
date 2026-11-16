import api from './axios';

export async function listReservations(page) {
  return (await api.get('/reservations', { params: { page } })).data;
}

export async function getReservation(id) {
  return (await api.get('/reservations/' + id)).data.reservation;
}

export async function cancelReservation(id) {
  return (await api.post('/reservations/' + id + '/cancel')).data.reservation;
}
