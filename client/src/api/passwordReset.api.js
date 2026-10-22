// API client for /api/password-reset - Owner: Member 2
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** POST /api/password-reset/request - Req 11 - Generate OTP, store its hash, email it */
export const requestOtp = (data) => api.post(`/password-reset/request`, data).then((r) => r.data);

/** POST /api/password-reset/confirm - Req 11 - Verify OTP and set the new password */
export const confirmReset = (data) => api.post(`/password-reset/confirm`, data).then((r) => r.data);
