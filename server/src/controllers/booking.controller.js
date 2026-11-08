import { asyncHandler } from '../utils/asyncHandler.js';
import * as bookingService from '../services/booking.service.js';

export const createBooking = asyncHandler(async (req, res) => {
  // The user comes from the token, never from the body: nobody can book
  // in someone else's name.
  const booking = await bookingService.createBooking(req.user._id, req.body);
  res.status(201).json({ success: true, data: { booking } });
});

export const myBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingService.listMyBookings(req.user._id);
  res.json({ success: true, data: { bookings } });
});

export const getBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBooking(req.params.id, req.user);
  res.json({ success: true, data: { booking } });
});

export const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelBooking(req.params.id, req.user);
  res.json({ success: true, data: { booking } });
});

export const listAllBookings = asyncHandler(async (req, res) => {
  const result = await bookingService.listAllBookings(req.validatedQuery);
  res.json({ success: true, data: result });
});

export const bookedDates = asyncHandler(async (req, res) => {
  const ranges = await bookingService.getBookedRanges(req.params.id, req.validatedQuery);
  res.json({ success: true, data: { bookedRanges: ranges } });
});
