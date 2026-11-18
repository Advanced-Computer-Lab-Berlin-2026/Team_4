import api from './axios';

export const listNotifications = (params = {}) => api.get('/notifications', { params }).then((r) => r.data);
export const getUnreadNotificationCount = () => api.get('/notifications/unread-count').then((r) => r.data);
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all').then((r) => r.data);
