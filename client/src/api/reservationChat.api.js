import api from './axios';

export async function listMessages(id, before) {
  return (await api.get('/reservation-chat/' + id + '/messages', { params: { before } })).data;
}

export async function sendMessage(id, text) {
  return (await api.post('/reservation-chat/' + id + '/messages', { text })).data.message;
}
