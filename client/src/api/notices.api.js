// API client for /api/notices - Owner: Member 9
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/notices - Req 42 - Notice board (newest first) */
export const listNotices = (params) => api.get(`/notices`, { params }).then((r) => r.data);

/** POST /api/notices - Req 41 - Post a community notice */
export const createNotice = (data) => api.post(`/notices`, data).then((r) => r.data);
