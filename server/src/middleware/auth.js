import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// protect: is this request from a logged-in user? (authentication)
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Not logged in');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret); // checks signature + expiry
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }

  // Look the user up again so a deleted user's old token stops working,
  // and so the role comes from the database, not from the token alone.
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'User no longer exists');

  req.user = user;
  next();
});

// optionalAuth: like protect, but a visitor without a token is allowed in
// (req.user stays undefined). Used where logged-in users get a personalised
// answer and everyone else a general one, e.g. recommendations.
// A token that IS sent but is invalid is still rejected, so a broken login
// is noticed instead of silently treated as "logged out".
export const optionalAuth = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return protect(req, res, next);
};

// authorize: is this user allowed to do this? (authorization)
// Usage: router.post('/cars', protect, authorize('admin'), createCar)
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission for this action'));
    }
    next();
  };
