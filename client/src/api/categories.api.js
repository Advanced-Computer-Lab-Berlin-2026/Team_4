// API client for /api/categories - Owner: Member 6
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/categories - Req 18, 34 - All active categories (PRE-IMPLEMENTED in foundation) */
export const listCategories = (params) => api.get(`/categories`, { params }).then((r) => r.data);

/** GET /api/categories/:slug - Req 34 - One category by slug (PRE-IMPLEMENTED in foundation) */
export const getCategory = (slug) => api.get(`/categories/${slug}`).then((r) => r.data);

/** PATCH /api/categories/:id/deposit-multiplier - Req 40 - Set the category deposit multiplier */
export const setDepositMultiplier = (id, data) => api.patch(`/categories/${id}/deposit-multiplier`, data).then((r) => r.data);
