// API client for /api/item-policies - Owner: Member 6
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** PUT /api/item-policies/:itemId/pickup - Req 30 - Set pickup location + instructions */
export const setPickup = (itemId, data) => api.put(`/item-policies/${itemId}/pickup`, data).then((r) => r.data);

/** PUT /api/item-policies/:itemId/rules - Req 31 - Set maxBorrowDays / minTrustScore */
export const setRules = (itemId, data) => api.put(`/item-policies/${itemId}/rules`, data).then((r) => r.data);

/** POST /api/item-policies/:itemId/manual - Req 32 - Upload usage manual (multipart: file) */
export const uploadManual = (itemId, data) => api.post(`/item-policies/${itemId}/manual`, data).then((r) => r.data); // multipart: pass a FormData

/** DELETE /api/item-policies/:itemId/manual - Req 32 - Remove the manual */
export const removeManual = (itemId) => api.delete(`/item-policies/${itemId}/manual`).then((r) => r.data);
