// API client for /api/account - Owner: Member 2
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** PUT /api/account/password - Req 10 - Change own password (member or admin) */
export const changePassword = (data) => api.put(`/account/password`, data).then((r) => r.data);

/** PUT /api/account/profile - Req 12 - Edit phone number / address */
export const updateProfile = (data) => api.put(`/account/profile`, data).then((r) => r.data);

/** GET /api/account/wallet - Req 36 - Return wallet balance */
export const getWallet = (params) => api.get(`/account/wallet`, { params }).then((r) => r.data);
