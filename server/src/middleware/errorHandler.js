import { env } from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
}

// Every error in the app ends up here, so all error responses share one shape:
// { success: false, message, details? }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  // MongoDB duplicate key, e.g. registering an email that already exists
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `An account with this ${field} already exists`;
  }

  // Invalid ObjectId in a URL, e.g. /api/cars/not-a-real-id
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  }

  if (status === 500) console.error(err);

  res.status(status).json({
    success: false,
    message: status === 500 && env.nodeEnv === 'production' ? 'Internal server error' : message,
    ...(err.details && { details: err.details }),
  });
}
