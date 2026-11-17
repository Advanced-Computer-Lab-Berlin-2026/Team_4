// API client for /api/borrow-lists - Owner: Member 5 (Req 46, 47, 48). Contract: docs/sprint2/member5.md §3
// One function per endpoint; components never call axios directly. Every call returns { borrowList }.
import api from './axios';

/** GET /api/borrow-lists/mine - Req 46-48 - My list with item details and each entry's problem (empty if none yet) */
export const getMyBorrowList = () => api.get('/borrow-lists/mine').then((r) => r.data);

/** POST /api/borrow-lists/mine/entries - Req 46 - Add an item: { itemId, startDate, endDate } (YYYY-MM-DD) */
export const addBorrowListEntry = (data) => api.post('/borrow-lists/mine/entries', data).then((r) => r.data);

/** PATCH /api/borrow-lists/mine/entries/:entryId - Req 48 - Change one entry's dates: { startDate, endDate } */
export const updateBorrowListEntry = (entryId, data) => api.patch(`/borrow-lists/mine/entries/${entryId}`, data).then((r) => r.data);

/** DELETE /api/borrow-lists/mine/entries/:entryId - Req 47 - Remove one entry */
export const removeBorrowListEntry = (entryId) => api.delete(`/borrow-lists/mine/entries/${entryId}`).then((r) => r.data);
