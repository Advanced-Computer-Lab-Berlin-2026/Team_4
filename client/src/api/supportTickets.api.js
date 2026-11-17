import api from './axios';

export const submitSupportTicket = (data) =>
    api.post('/support-tickets', data).then((r) => r.data);

export const getMySupportTickets = (params) =>
    api.get('/support-tickets/mine', { params }).then((r) => r.data);

export const getAllSupportTickets = (params) =>
    api.get('/support-tickets', { params }).then((r) => r.data);

export const getSupportTicketById = (id) =>
    api.get(`/support-tickets/${id}`).then((r) => r.data);

export const replyToSupportTicket = (id, data) =>
    api.post(`/support-tickets/${id}/messages`, data).then((r) => r.data);

export const resolveSupportTicket = (id, data) =>
    api.patch(`/support-tickets/${id}/resolve`, data).then((r) => r.data);