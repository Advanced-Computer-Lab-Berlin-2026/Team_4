// API client for /api/admin-users - Owner: Member 4
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/admin-users - Req 28, 29 - List/search users (q=name, role, lenderStatus, status, page) */
export const listUsers = (params) => api.get(`/admin-users`, { params }).then((r) => r.data);

/** GET /api/admin-users/:id - Req 22 - Basic information for one user */
export const getUser = (id) => api.get(`/admin-users/${id}`).then((r) => r.data);

/** PATCH /api/admin-users/:id/status - Req 39 - Suspend or reinstate an account */
export const setUserStatus = (id, data) => api.patch(`/admin-users/${id}/status`, data).then((r) => r.data);

/** DELETE /api/admin-users/:id - Req 7 - Remove a member/lender/admin (+ cascade cleanup) */
export const removeUser = (id) => api.delete(`/admin-users/${id}`).then((r) => r.data);

