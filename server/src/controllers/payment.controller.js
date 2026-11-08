import { asyncHandler } from '../utils/asyncHandler.js';
import * as paymentService from '../services/payment.service.js';

export const createOrder = asyncHandler(async (req, res) => {
  const order = await paymentService.createOrder(req.body.bookingId, req.user);
  res.status(201).json({ success: true, data: order });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const booking = await paymentService.verifyPayment(req.user, req.body);
  res.json({ success: true, message: 'Payment verified, booking confirmed', data: { booking } });
});

export const mockConfirm = asyncHandler(async (req, res) => {
  const booking = await paymentService.mockConfirm(req.body.bookingId, req.user);
  res.json({ success: true, message: 'MOCK payment accepted, booking confirmed', data: { booking } });
});
