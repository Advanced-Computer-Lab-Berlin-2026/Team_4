/** Throw these from controllers; middleware/errorHandler.js turns them into JSON. */
class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors; // optional array of { field, message }
  }
  static badRequest(msg = 'Bad request', errors) { return new ApiError(400, msg, errors); }
  static unauthorized(msg = 'Authentication required') { return new ApiError(401, msg); }
  static forbidden(msg = 'You do not have permission to do that') { return new ApiError(403, msg); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg); }
  static conflict(msg = 'Conflict') { return new ApiError(409, msg); }
  static notImplemented(what = 'This endpoint') { return new ApiError(501, `${what} is not implemented yet`); }
}
module.exports = ApiError;
