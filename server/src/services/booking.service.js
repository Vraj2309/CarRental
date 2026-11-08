import mongoose from 'mongoose';
import { Booking, blockingFilter, HOLD_MINUTES } from '../models/Booking.js';
import { Car } from '../models/Car.js';
import { ApiError } from '../utils/ApiError.js';
import { todayInIndia, addDays, daysBetween, formatDay } from '../utils/dates.js';
import { refundBooking } from './payment.service.js';
import { quoteForCar } from './pricing.service.js';

export const MAX_RENTAL_DAYS = 30;
export const MAX_DAYS_AHEAD = 180;
// Without this limit, one user could hold every car for free, 15 minutes at a time.
export const MAX_ACTIVE_HOLDS = 3;

// Fields of the car to show inside a booking.
const CAR_SUMMARY = 'brand model type city images pricePerDay';

export function checkDateRules(start, end) {
  const today = todayInIndia();
  const days = daysBetween(start, end);
  if (start < today) throw new ApiError(400, 'Pickup date cannot be in the past');
  if (start > addDays(today, MAX_DAYS_AHEAD)) {
    throw new ApiError(400, `Bookings open only ${MAX_DAYS_AHEAD} days in advance`);
  }
  if (days > MAX_RENTAL_DAYS) throw new ApiError(400, `Maximum rental is ${MAX_RENTAL_DAYS} days`);
  return days;
}

// Creates a PENDING booking that holds the dates for HOLD_MINUTES.
// It becomes confirmed only after a verified payment (payment.service.js).
export async function createBooking(userId, { carId, startDate, endDate }) {
  const days = checkDateRules(startDate, endDate);

  const activeHolds = await Booking.countDocuments({
    user: userId,
    status: 'pending',
    holdExpiresAt: { $gt: new Date() },
  });
  if (activeHolds >= MAX_ACTIVE_HOLDS) {
    throw new ApiError(429, 'You have too many unpaid bookings. Pay for or cancel one first.');
  }

  // Price the rental BEFORE the transaction. Calling another service inside
  // a transaction would keep it open (and the car locked) while we wait on
  // the network. If the ML service is down, this returns the flat base price.
  const car = await Car.findOne({ _id: carId, isActive: true })
    .select('city type pricePerDay')
    .lean();
  if (!car) throw new ApiError(404, 'Car not found');
  const quote = await quoteForCar(car, startDate, endDate);

  const session = await mongoose.startSession();
  let booking;
  try {
    // withTransaction runs the function as ONE all-or-nothing unit, and
    // retries it automatically if MongoDB reports a write conflict.
    await session.withTransaction(async () => {
      // 1) Claim the car by WRITING to it, so two simultaneous bookings of the
      //    same car collide and run one after the other (see Phase 3 notes).
      const locked = await Car.findOneAndUpdate(
        { _id: carId, isActive: true },
        { $inc: { bookingVersion: 1 } },
        { session }
      ).select('_id');
      if (!locked) throw new ApiError(404, 'Car not found');

      // 2) Any confirmed booking, or any pending one still on hold?
      const clash = await Booking.exists(blockingFilter(carId, startDate, endDate)).session(session);
      if (clash) throw new ApiError(409, 'This car is already booked for some of these dates');

      // 3) Create the pending booking with a price snapshot and a hold.
      [booking] = await Booking.create(
        [
          {
            user: userId,
            car: carId,
            startDate,
            endDate,
            days,
            pricePerDay: Math.round(quote.totalPrice / days), // average per day
            totalPrice: quote.totalPrice,
            pricing: {
              source: quote.source, // "ml" or "fallback"
              baseRate: car.pricePerDay,
              avgMultiplier: quote.avgMultiplier,
              modelVersion: quote.modelVersion,
              reasons: quote.reasons,
            },
            status: 'pending',
            holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
          },
        ],
        { session } // create() needs an array when used with a session
      );
    });
  } finally {
    await session.endSession();
  }

  // Detach the ended session before running another query on this document.
  booking.$session(null);
  return booking.populate('car', CAR_SUMMARY);
}

export async function listMyBookings(userId) {
  return Booking.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('car', CAR_SUMMARY)
    .lean();
}

// Owners see their own booking, admins see any. Everyone else gets 404, not
// 403: "forbidden" would confirm that the booking id exists.
async function findAccessibleBooking(bookingId, user) {
  const booking = await Booking.findById(bookingId);
  const isOwner = booking && booking.user.equals(user._id);
  if (!booking || (!isOwner && user.role !== 'admin')) throw new ApiError(404, 'Booking not found');
  return booking;
}

export async function getBooking(bookingId, user) {
  const booking = await findAccessibleBooking(bookingId, user);
  return booking.populate([
    { path: 'car', select: CAR_SUMMARY },
    { path: 'user', select: 'name email' },
  ]);
}

export async function cancelBooking(bookingId, user) {
  const booking = await findAccessibleBooking(bookingId, user);
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw new ApiError(400, `A ${booking.status} booking cannot be cancelled`);
  }
  if (booking.startDate <= todayInIndia() && user.role !== 'admin') {
    throw new ApiError(400, 'A trip that has already started cannot be cancelled');
  }

  // Conditional update: only cancels if the status has not changed meanwhile.
  // Two cancel clicks at once: the second finds nothing to update.
  const cancelled = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    { $set: { status: 'cancelled', cancelledAt: new Date() }, $unset: { holdExpiresAt: 1 } },
    { new: true }
  );
  if (!cancelled) throw new ApiError(409, 'Booking was already updated, please refresh');

  // Paid? Give the money back. A failed refund is recorded, not thrown:
  // the cancellation itself already happened and must stand.
  let refund = 'not_needed';
  if (cancelled.payment?.status === 'paid') {
    refund = (await refundBooking(cancelled)) ? 'refunded' : 'refund_failed';
  }

  const result = await Booking.findById(cancelled._id).populate('car', CAR_SUMMARY);
  return { booking: result, refund };
}

// Public: which days is this car taken? Only date ranges, never who booked.
export async function getBookedRanges(carId, { from, to } = {}) {
  const car = await Car.exists({ _id: carId, isActive: true });
  if (!car) throw new ApiError(404, 'Car not found');

  const start = from || todayInIndia();
  const end = to || addDays(start, MAX_DAYS_AHEAD);
  const bookings = await Booking.find(blockingFilter(carId, start, end))
    .select('startDate endDate -_id')
    .sort({ startDate: 1 })
    .lean();

  return bookings.map((b) => ({ startDate: formatDay(b.startDate), endDate: formatDay(b.endDate) }));
}

export async function listAllBookings({ status, car, page, limit }) {
  const filter = {};
  if (status) filter.status = status;
  if (car) filter.car = car;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('car', 'brand model city')
      .populate('user', 'name email')
      .lean(),
    Booking.countDocuments(filter),
  ]);
  return { bookings, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
