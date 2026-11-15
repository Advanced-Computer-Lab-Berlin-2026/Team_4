import api from './axios';

export const getMyReferrals = () => api.get('/referrals/mine').then((r) => r.data);
export const captureReferral = (code) => api.post('/referrals/capture', { code }).then((r) => r.data);
export const getReferralReport = (params = {}) => api.get('/referrals/report', { params }).then((r) => r.data);
