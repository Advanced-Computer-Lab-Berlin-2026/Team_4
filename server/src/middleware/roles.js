const ApiError = require('../utils/ApiError');
const { ROLES, LENDER_STATUS } = require('../config/constants');

/** NFR 6 (RBAC). Always place AFTER protect:  router.get('/x', protect, requireRole('admin'), handler) */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};

/** Only verified lenders (role member + lenderStatus verified) may list items. Place AFTER protect. */
const requireVerifiedLender = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== ROLES.MEMBER || req.user.lenderStatus !== LENDER_STATUS.VERIFIED) {
    return next(ApiError.forbidden('Only verified lenders can do that'));
  }
  next();
};

module.exports = { requireRole, requireVerifiedLender };
