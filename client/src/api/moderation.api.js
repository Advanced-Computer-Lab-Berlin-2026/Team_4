import api from './axios';

export const listModerationReports = (params) =>
    api.get('/moderation/reports', { params }).then((r) => r.data);

export const createModerationReport = (data) =>
    api.post('/moderation/reports', data).then((r) => r.data);

export const reviewModerationReport = (id, data) =>
    api.patch(`/moderation/reports/${id}/action`, data).then((r) => r.data);