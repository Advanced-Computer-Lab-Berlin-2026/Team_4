// API client for /api/lender-applications - Owner: Member 3
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/lender-applications/mine - Req 2, 3 - Current user's application (draft/pending/approved/rejected) */
export const getMyApplication = (params) => api.get(`/lender-applications/mine`, { params }).then((r) => r.data);

/** POST /api/lender-applications/documents - Req 3 - Upload a document (multipart: type + file) */
export const uploadDocument = (data) => api.post(`/lender-applications/documents`, data).then((r) => r.data); // multipart: pass a FormData

/** GET /api/lender-applications/documents/:docId - Req 3 - Owner previews one of their own documents */
export const previewDocument = (docId) => api.get(`/lender-applications/documents/${docId}`).then((r) => r.data);

/** DELETE /api/lender-applications/documents/:docId - Req 3 - Remove an uploaded document */
export const removeDocument = (docId) => api.delete(`/lender-applications/documents/${docId}`).then((r) => r.data);

/** POST /api/lender-applications/submit - Req 2 - Submit the application (requires ID + proof of address) */
export const submitApplication = (data) => api.post(`/lender-applications/submit`, data).then((r) => r.data);
