// API client for /api/catalog - Owner: Member 7
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/catalog - Req 16, 17, 18, 35, 44 - Public list: q, category, availableFrom + availableTo (YYYY-MM-DD), page, limit, sort */
export const listItems = (params) => api.get(`/catalog`, { params }).then((r) => r.data);

/** GET /api/catalog/:id - Req 19, 20, 35 - Item details + owner name + category */
export const getItem = (id) => api.get(`/catalog/${id}`).then((r) => r.data);

/** GET /api/catalog/:id/availability - Req 43 - params: from, to (YYYY-MM-DD) -> { booked: [{ start, end, type }] } */
export const getAvailability = (id, params) => api.get(`/catalog/${id}/availability`, { params }).then((r) => r.data);

/** GET /api/catalog/:id/alternatives - Req 92 - params: start, end (YYYY-MM-DD), limit -> { items } */
export const getAlternatives = (id, params) => api.get(`/catalog/${id}/alternatives`, { params }).then((r) => r.data);
