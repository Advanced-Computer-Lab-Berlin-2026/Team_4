import api from './axios';

export const listNotifications = (params = {}) => api.get('/notifications', { params }).then((r) => r.data);
export const getUnreadNotificationCount = () => api.get('/notifications/unread-count').then((r) => r.data);
export const NOTIFICATIONS_READ = 'shareshed:notifications-read';

function notifyRead(response) {
  window.dispatchEvent(new Event(NOTIFICATIONS_READ));
  return response.data;
}

export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`).then(notifyRead);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all').then(notifyRead);
