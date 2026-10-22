// API client for /api/admins - Owner: Member 1
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** POST /api/admins - Req 6 - Create another admin account */
export const createAdmin = (data) => api.post(`/admins`, data).then((r) => r.data);
