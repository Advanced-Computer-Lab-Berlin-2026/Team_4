// API client for /api/memberships - Owner: Member 8
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/memberships/tiers - Req 83 - tiers that can be chosen */
export const listTiers = () => api.get(`/memberships/tiers`).then((r) => r.data);

/** GET /api/memberships/me - Req 86 - current tier, renewal date, entitlements and usage */
export const getMyMembership = () => api.get(`/memberships/me`).then((r) => r.data);

/**
 * POST /api/memberships/subscribe - Req 84, 85 - { tierId, method: 'wallet' | 'card', operationKey }
 * Resolves with { membership, ... } when active, or { payment: { state: 'pending', redirectUrl? } } (HTTP 202).
 * Send the same operationKey again to retry or to finish a card payment; it is never charged twice.
 */
export const subscribe = (data) => api.post(`/memberships/subscribe`, data).then((r) => r.data);

/** POST /api/memberships/cancel - Req 87 - benefits stay until the renewal date */
export const cancelSubscription = () => api.post(`/memberships/cancel`).then((r) => r.data);

/** GET /api/memberships/report - Req 108 - admin - members per tier */
export const getMembershipReport = () => api.get(`/memberships/report`).then((r) => r.data);
