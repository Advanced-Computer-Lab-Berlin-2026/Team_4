// API client for /api/reservation-lifecycle - Owner: Member 5 (Req 53, 54, 56-60). Contract: docs/sprint2/member5.md §4-§5
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/reservation-lifecycle/mine - Req 53, 54 - { status?, from?, to?, page?, limit? } -> { items, total, page, limit, pages } */
export const listMyReservations = (params) => api.get('/reservation-lifecycle/mine', { params }).then((r) => r.data);

/** GET /api/reservation-lifecycle/:id - Req 53 - one reservation for its borrower or lender -> { reservation } */
export const getReservation = (id) => api.get(`/reservation-lifecycle/${id}`).then((r) => r.data);

/** GET /api/reservation-lifecycle/lending - Req 56-60 - bookings of my items; + { item?, needsAction? } -> { ..., waiting: { requests, extensions } } */
export const listLendingReservations = (params) => api.get('/reservation-lifecycle/lending', { params }).then((r) => r.data);

/** GET /api/reservation-lifecycle/lending/items - my items that have bookings -> { items: [{ _id, title, isArchived, bookings }] } */
export const listLendingItems = () => api.get('/reservation-lifecycle/lending/items').then((r) => r.data);

/** PATCH /api/reservation-lifecycle/:id/approve - Req 56 - lender approves a pending request -> { reservation } */
export const approveReservation = (id) => api.patch(`/reservation-lifecycle/${id}/approve`).then((r) => r.data);

/** PATCH /api/reservation-lifecycle/:id/reject - Req 56 - lender declines: { reason? } (up to 500) -> { reservation } */
export const rejectReservation = (id, reason) => api.patch(`/reservation-lifecycle/${id}/reject`, { reason }).then((r) => r.data);

/** PATCH /api/reservation-lifecycle/:id/pickup - Req 59 - lender marks the item as picked up -> { reservation } */
export const markPickedUp = (id) => api.patch(`/reservation-lifecycle/${id}/pickup`).then((r) => r.data);

/** PATCH /api/reservation-lifecycle/:id/return - Req 60 - lender records a return in good condition -> { reservation } */
export const markReturned = (id) => api.patch(`/reservation-lifecycle/${id}/return`).then((r) => r.data);

/** POST /api/reservation-lifecycle/:id/extension - Req 74 - borrower asks for a later return date -> { reservation } */
export const requestExtension = (id, requestedEndDate) => api.post(`/reservation-lifecycle/${id}/extension`, { requestedEndDate }).then((r) => r.data);

/** DELETE /api/reservation-lifecycle/:id/extension - Req 74 - borrower withdraws the pending request -> { reservation } */
export const cancelExtension = (id, requestId) => api.delete(`/reservation-lifecycle/${id}/extension`, { data: { requestId } }).then((r) => r.data);

/** PATCH /api/reservation-lifecycle/:id/extension/approve | reject - Req 75 - lender answers -> { reservation } */
export const answerExtension = (id, decision, requestId) => api.patch(`/reservation-lifecycle/${id}/extension/${decision}`, { requestId }).then((r) => r.data);
