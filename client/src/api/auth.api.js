// API client for /api/auth - Owner: Member 1
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** POST /api/auth/register - Req 1 - Create a member account; hash password with user.setPassword() */
export const register = (data) => api.post(`/auth/register`, data).then((r) => r.data);

/** POST /api/auth/login - Req 4 - Verify credentials, reject suspended accounts, set auth cookie */
export const login = (data) => api.post(`/auth/login`, data).then((r) => r.data);

/** POST /api/auth/logout - Req 5 - Clear auth cookie */
export const logout = (data) => api.post(`/auth/logout`, data).then((r) => r.data);

/** GET /api/auth/me - Req 4 - Return the logged-in user (PRE-IMPLEMENTED in foundation) */
export const me = (params) => api.get(`/auth/me`, { params }).then((r) => r.data);
