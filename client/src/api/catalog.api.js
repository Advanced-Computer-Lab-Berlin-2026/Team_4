// API client for /api/catalog - Owner: Member 7
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/catalog - Req 16, 17, 18, 35 - Public list: q (name), category, page, limit, sort. Use Item.publicFilter() */
export const listItems = (params) => api.get(`/catalog`, { params }).then((r) => r.data);

/** GET /api/catalog/:id - Req 19, 20, 35 - Item details + owner name + category */
export const getItem = (id) => api.get(`/catalog/${id}`).then((r) => r.data);
