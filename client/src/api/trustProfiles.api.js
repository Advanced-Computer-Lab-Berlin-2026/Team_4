// API client for /api/trust-profiles - Owner: Member 3 (Sprint 2)
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/trust-profiles/me - Req 91 - own trust profile -> { profile } */
export const getMyTrustProfile = () => api.get(`/trust-profiles/me`).then((r) => r.data);

/** GET /api/trust-profiles/:userId - Req 91 - public trust summary -> { profile } */
export const getTrustProfile = (userId) => api.get(`/trust-profiles/${userId}`).then((r) => r.data);

/** POST /api/trust-profiles/:userId/recalculate - Req 98 - admin repair tool -> { profile } */
export const recalculateTrust = (userId) => api.post(`/trust-profiles/${userId}/recalculate`).then((r) => r.data);
