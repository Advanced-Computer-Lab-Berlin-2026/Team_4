// API client for /api/reviews - Owner: Member 3 (Sprint 2)
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** POST /api/reviews - Req 89, 90 - data: { reservationId, rating, comment? } -> { review } */
export const createReview = (data) => api.post(`/reviews`, data).then((r) => r.data);

/** GET /api/reviews/mine - Req 97 - params: { type: 'given' | 'received', page, limit } -> paginated reviews */
export const listMyReviews = (params) => api.get(`/reviews/mine`, { params }).then((r) => r.data);

/** GET /api/reviews/pending - Req 89, 90 - completed reservations I can still review -> { items } */
export const listPendingReviews = () => api.get(`/reviews/pending`).then((r) => r.data);

/** GET /api/reviews/user/:userId - Req 91 - reviews a user has received -> paginated reviews */
export const listUserReviews = (userId, params) => api.get(`/reviews/user/${userId}`, { params }).then((r) => r.data);
