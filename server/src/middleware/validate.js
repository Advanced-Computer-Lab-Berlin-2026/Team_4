const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Put after express-validator chains:  router.post('/x', [body('email').isEmail()], validate, handler) */
module.exports = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  next(ApiError.badRequest(errors[0].message, errors));
};
