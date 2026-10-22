// API client for /api/admin-items - Owner: Member 9
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/admin-items - Req 23 - All item listings on the platform (paginated) */
export const listAllItems = (params) => api.get(`/admin-items`, { params }).then((r) => r.data);
