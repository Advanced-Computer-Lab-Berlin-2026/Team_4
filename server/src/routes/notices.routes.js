// NOTICES ROUTES - Owner: Member 9 - mounted automatically at /api/notices
const router = require('express').Router();
const c = require('../controllers/notices.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { body } = require('express-validator');
const validate = require('../middleware/validate');

router.get('/', protect, c.listNotices); // Req 42
router.post(
  '/',
  protect,
  requireRole('admin'),
  [
    body('title').isString().withMessage('Title is required').bail().trim()
      .notEmpty().withMessage('Title is required').bail().isLength({ max: 150 })
      .withMessage('Title must be 150 characters or fewer'),
    body('body').isString().withMessage('Body is required').bail().trim()
      .notEmpty().withMessage('Body is required').bail().isLength({ max: 5000 })
      .withMessage('Body must be 5000 characters or fewer'),
    body('pinned').optional().isBoolean().withMessage('Pinned must be a boolean').toBoolean(),
  ],
  validate,
  c.createNotice
); // Req 41

module.exports = router;
