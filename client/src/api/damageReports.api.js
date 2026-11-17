// API client for /api/damage-reports - Owner: Member 3 (Sprint 2)
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** POST /api/damage-reports - Req 61 - data: { reservationId, description } -> { report } */
export const createReport = (data) => api.post(`/damage-reports`, data).then((r) => r.data);

/** GET /api/damage-reports/mine - Req 61, 63 - params: { role?: 'lender' | 'borrower', page, limit } -> paginated reports */
export const listMyReports = (params) => api.get(`/damage-reports/mine`, { params }).then((r) => r.data);

/** GET /api/damage-reports - Req 62, 64 - admin work queue - params: { status?, page, limit } -> paginated reports */
export const listReports = (params) => api.get(`/damage-reports`, { params }).then((r) => r.data);

/** GET /api/damage-reports/:id - Req 62, 63, 64, 80 - one report with photo metadata -> { report } */
export const getReport = (id) => api.get(`/damage-reports/${id}`).then((r) => r.data);

/** PATCH /api/damage-reports/:id/decision - Req 62 - data: { forfeitAmount, note } -> { report } */
export const decideReport = (id, data) => api.patch(`/damage-reports/${id}/decision`, data).then((r) => r.data);

/** POST /api/damage-reports/:id/dispute - Req 63 - data: { reason } -> { report } */
export const disputeReport = (id, data) => api.post(`/damage-reports/${id}/dispute`, data).then((r) => r.data);

/** PATCH /api/damage-reports/:id/resolution - Req 64 - data: { finalForfeitAmount, note } -> { report } */
export const resolveReport = (id, data) => api.patch(`/damage-reports/${id}/resolution`, data).then((r) => r.data);
