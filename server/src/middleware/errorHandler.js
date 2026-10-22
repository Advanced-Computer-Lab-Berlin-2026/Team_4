const multer = require('multer');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Server error';
  let errors = err.errors;

  if (err instanceof ApiError) {
    // as-is
  } else if (err.name === 'ValidationError' && err.errors) { // mongoose
    status = 400;
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = errors[0].message;
  } else if (err.code === 11000) { // duplicate key
    status = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    message = `That ${field} is already in use`;
    errors = [{ field, message }];
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${env.MAX_UPLOAD_MB} MB)` : err.message;
  } else if (status === 500 && env.NODE_ENV === 'production') {
    message = 'Server error';
  }

  if (status >= 500 && status !== 501) console.error(err);
  res.status(status).json({ message, ...(errors ? { errors } : {}) });
};
