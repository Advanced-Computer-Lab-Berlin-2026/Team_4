// API client for /api/payments - Owner: Member 2
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/payments/policy - Req 77/81 - { policy: { currency, cancellation:{...}, lateFee:{...} } } (public) */
export const getPolicy = () => api.get(`/payments/policy`).then((r) => r.data);

/** GET /api/payments/late-fees - Req 78 - { items, total, page, limit, pages, outstandingTotalMinor } */
export const getLateFees = (params) => api.get(`/payments/late-fees`, { params }).then((r) => r.data);
