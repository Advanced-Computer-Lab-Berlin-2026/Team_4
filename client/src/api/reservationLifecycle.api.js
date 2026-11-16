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
