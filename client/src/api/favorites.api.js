// API client for /api/favorites - Owner: Member 9
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/favorites - Req 38 - My favorites with item data */
export const listFavorites = (params) => api.get(`/favorites`, { params }).then((r) => r.data);

/** GET /api/favorites/ids - Req 37 - Only item ids (for heart-button state) */
export const listFavoriteIds = (params) => api.get(`/favorites/ids`, { params }).then((r) => r.data);

/** POST /api/favorites/:itemId - Req 37 - Add to favorites */
export const addFavorite = (itemId, data) => api.post(`/favorites/${itemId}`, data).then((r) => r.data);

/** DELETE /api/favorites/:itemId - Req 38 - Remove from favorites */
export const removeFavorite = (itemId) => api.delete(`/favorites/${itemId}`).then((r) => r.data);
