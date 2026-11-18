// REVIEWS ROUTES - Owner: Member 3 - mounted automatically at /api/reviews
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const c = require('../controllers/reviews.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');

const createRules = [
  body('reservationId').isMongoId().withMessage('Invalid reservation id'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be a whole number from 1 to 5').toInt(),
  body('comment')
    .optional({ values: 'null' })
    .isString().withMessage('Comment must be text')
    .bail()
    .trim()
    .isLength({ max: 1500 }).withMessage('Comment must be at most 1500 characters'),
];
const typeRule = query('type').optional().isIn(['given', 'received']).withMessage("Type must be 'given' or 'received'");
const userIdParam = param('userId').isMongoId().withMessage('Invalid user id');

router.post('/', protect, requireRole('member'), createRules, validate, c.createReview); // Req 89, 90
router.get('/mine', protect, requireRole('member'), typeRule, validate, c.listMyReviews); // Req 97
router.get('/pending', protect, requireRole('member'), c.listPendingReviews); // Req 89, 90
router.get('/user/:userId', protect, userIdParam, validate, c.listUserReviews); // Req 91

module.exports = router;
