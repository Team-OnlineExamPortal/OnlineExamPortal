'use strict';

/**
 * Shared error type + Express error handling.
 * Every error response uses the body required by SAD 4.4:
 *   { code, message, requestId }
 */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/** Wrap async route handlers so rejected promises reach the error handler. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Resource not found',
    requestId: req.id,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ code: err.code, message: err.message, requestId: req.id });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ code: 'INVALID_JSON', message: 'Malformed JSON body', requestId: req.id });
  }
  if (err && err.type === 'entity.too.large') {
    return res
      .status(413)
      .json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', requestId: req.id });
  }

  // Unexpected error: never leak internals or request data to the client/log.
  console.error(`[${req.id}] Unhandled error:`, err && err.message);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong',
    requestId: req.id,
  });
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
