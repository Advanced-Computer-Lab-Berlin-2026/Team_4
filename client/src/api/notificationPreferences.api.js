import api from './axios';

export const getNotificationPreferences = () => api.get('/notification-preferences').then((r) => r.data);
export const updateNotificationPreferences = (preferences) =>
  api.put('/notification-preferences', preferences).then((r) => r.data);
