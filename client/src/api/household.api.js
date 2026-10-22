// API client for /api/household - Owner: Member 8
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/household - Req 26 - My links (incoming + outgoing) with status */
export const listLinks = (params) => api.get(`/household`, { params }).then((r) => r.data);

/** POST /api/household/requests - Req 24 - Send request by email/phone + relation */
export const sendRequest = (data) => api.post(`/household/requests`, data).then((r) => r.data);

/** PATCH /api/household/requests/:id/respond - Req 25 - Accept or decline an incoming request */
export const respondToRequest = (id, data) => api.patch(`/household/requests/${id}/respond`, data).then((r) => r.data);

/** DELETE /api/household/:id - Req 27 - Unlink */
export const removeLink = (id) => api.delete(`/household/${id}`).then((r) => r.data);
