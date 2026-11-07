import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

function signToken(user) {
  // Keep the payload small: just the user id ("sub" = subject) and role.
  // Never put passwords or personal data in a JWT; anyone can decode it.
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export async function registerUser({ name, email, phone, password }) {
  // role is not accepted here: every public sign-up is a normal user.
  const user = await User.create({ name, email, phone, password });
  return { user, token: signToken(user) };
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select('+password');

  // Same message for "no such email" and "wrong password", so attackers
  // can't use the login form to discover which emails are registered.
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  return { user, token: signToken(user) };
}
