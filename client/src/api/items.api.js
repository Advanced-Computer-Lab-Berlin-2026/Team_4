// API client for /api/items - Owner: Member 5
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/items/mine - Req 21 - All items owned by the current lender (incl. archived) */
export const listMyItems = (params) => api.get(`/items/mine`, { params }).then((r) => r.data);

/** POST /api/items - Req 13 - Create a listing (multipart: fields + photos[]) */
export const createItem = (data) => api.post(`/items`, data).then((r) => r.data); // multipart: pass a FormData

/** GET /api/items/:id - Req 14 - One of my items for the edit form */
export const getMyItem = (id) => api.get(`/items/${id}`).then((r) => r.data);

/** PUT /api/items/:id - Req 14 - Edit details, deposit amount, category */
export const updateItem = (id, data) => api.put(`/items/${id}`, data).then((r) => r.data);

/** POST /api/items/:id/photos - Req 13, 14 - Add photos to an existing listing */
export const addPhotos = (id, data) => api.post(`/items/${id}/photos`, data).then((r) => r.data); // multipart: pass a FormData

/** DELETE /api/items/:id/photos/:photoId - Req 14 - Remove one photo */
export const removePhoto = (id, photoId) => api.delete(`/items/${id}/photos/${photoId}`).then((r) => r.data);

/** PATCH /api/items/:id/archive - Req 15 - Archive (hidden from search, history kept) */
export const archiveItem = (id, data) => api.patch(`/items/${id}/archive`, data).then((r) => r.data);

/** PATCH /api/items/:id/unarchive - Req 15 - Unarchive */
export const unarchiveItem = (id, data) => api.patch(`/items/${id}/unarchive`, data).then((r) => r.data);
