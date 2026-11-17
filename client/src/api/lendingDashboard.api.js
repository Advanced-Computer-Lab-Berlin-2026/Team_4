// API client for /api/lending-dashboard - Owner: Member 5 (Req 106). Contract: docs/sprint2/member5.md §7
import api from './axios';

/** GET /api/lending-dashboard - Req 106 - { period?: 'all' | '30d' } -> { period, loans, deposits, damage, needsAction, items } */
export const getLendingDashboard = (params) => api.get('/lending-dashboard', { params }).then((r) => r.data);
