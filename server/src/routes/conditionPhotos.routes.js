// CONDITION PHOTOS ROUTES - Owner: Member 3 - mounted automatically at /api/condition-photos
const router = require('express').Router();
const { param } = require('express-validator');
const c = require('../controllers/conditionPhotos.controller');
const { protect } = require('../middleware/auth');
const { requireVerifiedLender } = require('../middleware/roles');
const { uploadConditionPhotos } = require('../middleware/upload');
const validate = require('../middleware/validate');

const reservationParam = param('reservationId').isMongoId().withMessage('Invalid reservation id');
const photoParam = param('photoId').isMongoId().withMessage('Invalid photo id');
const stageParam = param('stage').isIn(['pickup', 'return']).withMessage("Stage must be 'pickup' or 'return'");

router.get('/:reservationId', protect, reservationParam, validate, c.listPhotos); // Req 79, 80
// Checks run before uploadConditionPhotos so refused requests never write files (docs/SPRINT2_CONTRACT.md).
router.post('/:reservationId/:stage', protect, requireVerifiedLender, reservationParam, stageParam, validate, c.checkCanUpload, uploadConditionPhotos, c.uploadPhotos); // Req 79
router.get('/:reservationId/:photoId/file', protect, reservationParam, photoParam, validate, c.streamPhoto); // Req 79, 80
router.delete('/:reservationId/:photoId', protect, requireVerifiedLender, reservationParam, photoParam, validate, c.removePhoto); // Req 79

module.exports = router;
