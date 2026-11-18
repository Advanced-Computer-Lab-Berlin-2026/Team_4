// API client for /api/waitlists - Owner: Member 7
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** POST /api/waitlists - Req 65 - body: { itemId, startDate, endDate } (YYYY-MM-DD) */
export const joinWaitlist = (data) => api.post(`/waitlists`, data).then((r) => r.data);

/** GET /api/waitlists/mine - Req 66 - my entries; optional params: { item } */
export const listMyWaitlists = (params) => api.get(`/waitlists/mine`, { params }).then((r) => r.data);

/** DELETE /api/waitlists/:id - Req 66 - leave the waitlist (or give up an offer) */
export const leaveWaitlist = (id) => api.delete(`/waitlists/${id}`).then((r) => r.data);
