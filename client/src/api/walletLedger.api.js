// API client for /api/wallet-ledger - Owner: Member 2
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/wallet-ledger - Req 36/78 - own wallet history: { items, total, page, limit, pages } */
export const getLedger = (params) => api.get(`/wallet-ledger`, { params }).then((r) => r.data);
