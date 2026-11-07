import { asyncHandler } from '../utils/asyncHandler.js';
import { registerUser, loginUser } from '../services/auth.service.js';

// Controllers are thin: read the request, call a service, send the response.

export const register = asyncHandler(async (req, res) => {
  const { user, token } = await registerUser(req.body);
  res.status(201).json({ success: true, data: { user, token } });
});

export const login = asyncHandler(async (req, res) => {
  const { user, token } = await loginUser(req.body);
  res.json({ success: true, data: { user, token } });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});
