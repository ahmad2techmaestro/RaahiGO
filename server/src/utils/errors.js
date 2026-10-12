// A typed application error — controllers throw this and the centralized
// error handler in index.js turns it into the right HTTP response.
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

// Wraps an async route handler so thrown errors / rejected promises are
// forwarded to next(err) automatically instead of needing try/catch in
// every controller.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { AppError, asyncHandler };
