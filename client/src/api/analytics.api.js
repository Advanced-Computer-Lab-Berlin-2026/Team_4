import api from './axios';

export const getUsageReport = (params) =>
    api.get('/analytics/usage', { params }).then((r) => r.data);

export const getDamageReport = (params) =>
    api.get('/analytics/damage', { params }).then((r) => r.data);

export const downloadUsageReportExport = async (params) => {
    const res = await api.get('/analytics/usage/export', {
        params,
        responseType: 'blob',
    });
    return res.data;
};

export const downloadDamageReportExport = async (params) => {
    const res = await api.get('/analytics/damage/export', {
        params,
        responseType: 'blob',
    });
    return res.data;
};