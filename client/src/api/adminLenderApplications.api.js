// API client for /api/admin-lender-applications - Owner: Member 3
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/admin-lender-applications - Req 9 - List applications (filter by status) */
export const listApplications = (params) => api.get(`/admin-lender-applications`, { params }).then((r) => r.data);

/** GET /api/admin-lender-applications/:id - Req 8 - One application with applicant info + document list */
export const getApplication = (id) => api.get(`/admin-lender-applications/${id}`).then((r) => r.data);

/** GET /api/admin-lender-applications/:id/documents/:docId - Req 8 - Stream a private document file to the admin. Resolves to a Blob. */
export const downloadDocument = (id, docId) =>
  api.get(`/admin-lender-applications/${id}/documents/${docId}`, { responseType: 'blob' }).then((r) => r.data);

/** PATCH /api/admin-lender-applications/:id/decision - Req 9 - Accept/reject; accept sets user.lenderStatus='verified'
 *  data: { decision: 'approve' | 'reject', reason? } */
export const decideApplication = (id, data) => api.patch(`/admin-lender-applications/${id}/decision`, data).then((r) => r.data);
