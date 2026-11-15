const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const controller = require('../controllers/notifications.controller');
const { startNotificationWorker } = require('../jobs/notificationWorker');
const { startReminderJobs } = require('../jobs/reminders');

startNotificationWorker();
startReminderJobs();

router.get('/', protect, requireRole('member'), controller.list);
router.get('/unread-count', protect, requireRole('member'), controller.unreadCount);
router.patch('/read-all', protect, requireRole('member'), controller.markAllRead);
router.patch('/:id/read', protect, requireRole('member'), controller.markRead);

module.exports = router;
