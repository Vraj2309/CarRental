import mongoose from 'mongoose';
import { Booking, BLOCKING_STATUSES } from '../models/Booking.js';
import { Car } from '../models/Car.js';
import { ApiError } from '../utils/ApiError.js';
import { todayInIndia, addDays, daysBetween, formatDay } from '../utils/dates.js';

export const MAX_RENTAL_DAYS = 30;
export const MAX_DAYS_AHEAD = 180;

// Fields of the car to show inside a booking.
const CAR_SUMMARY = 'brand model type city images pricePerDay';

// Two date ranges overlap when each one starts before the other ends:
//
//   existing:     |=======|            start < newEnd  AND  end > newStart
//   new:              |=======|
//
// Return day is exclusive, so a booking ending on the 13th and one starting
// on the 13th do NOT overlap.
const overlapFilter = (carId, start, end) => ({
  car: carId,
  status: { $in: BLOCKING_STATUSES },
  startDate: { $lt: end },
  endDate: { $gt: start },
});

function checkDateRules(start, end) {
  const today = todayInIndia();
  const days = daysBetween(start, end);
  if (start < today) throw new ApiError(400, 'Pickup date cannot be in the past');
  if (start > addDays(today, MAX_DAYS_AHEAD)) {
    throw new ApiError(400, `Bookings open only ${MAX_DAYS_AHEAD} days in advance`);
  }
  if (days > MAX_RENTAL_DAYS) throw new ApiError(400, `Maximum rental is ${MAX_RENTAL_DAYS} days`);
  return days;
}

export async function createBooking(userId, { carId, startDate, endDate }) {
  const days = checkDateRules(startDate, endDate);

  const session = await mongoose.startSession();
  let booking;
  try {
    // withTransaction runs the function as ONE all-or-nothing unit, and
    // automatically retries it if MongoDB reports a conflict.
    await session.withTransaction(async () => {
      // 1) Claim the car by WRITING to it.
      //    Why: a transaction only reads a snapshot. Two users booking the same
      //    dates at the same moment would each see "no overlap" and each insert
      //    their own booking; both inserts are different documents, so nothing
      //    collides and both succeed (a "write skew" race).
      //    By having both transactions write to the SAME car document, MongoDB
      //    sees the collision, aborts one, and withTransaction re-runs it. On
      //    the re-run it sees the first booking and gets 409.
      const car = await Car.findOneAndUpdate(
        { _id: carId, isActive: true },
        { $inc: { bookingVersion: 1 } },
        { session, new: true }
      ).select('pricePerDay');
      if (!car) throw new ApiError(404, 'Car not found');

      // 2) Check for overlapping bookings (inside the same transaction).
      const clash = await Booking.exists(overlapFilter(carId, startDate, endDate)).session(session);
      if (clash) throw new ApiError(409, 'This car is already booked for some of these dates');

      // 3) Create the booking with a price snapshot.
      [booking] = await Booking.create(
        [
          {
            user: userId,
            car: carId,
            startDate,
            endDate,
            days,
            pricePerDay: car.pricePerDay,
            totalPrice: days * car.pricePerDay,
          },
        ],
        { session } // create() needs an array when used with a session
      );
    });
  } finally {
    await session.endSession();
  }

  // The document still remembers the (now ended) session; detach it before
  // running another query on it, or Mongoose would try to reuse it.
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
  if (booking.status !== 'confirmed') {
    throw new ApiError(400, `A ${booking.status} booking cannot be cancelled`);
  }
  if (booking.startDate <= todayInIndia() && user.role !== 'admin') {
    throw new ApiError(400, 'A trip that has already started cannot be cancelled');
  }

  // Conditional update: only cancels if it is STILL confirmed. If two cancel
  // requests arrive together, the second one finds nothing to update.
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    { status: 'cancelled', cancelledAt: new Date() },
    { new: true }
  ).populate('car', CAR_SUMMARY);
  if (!updated) throw new ApiError(409, 'Booking was already updated, please refresh');
  return updated;
}

// Public: which days is this car taken? Returns only date ranges, never who
// booked them, so the frontend calendar can grey out those days.
export async function getBookedRanges(carId, { from, to } = {}) {
  const car = await Car.exists({ _id: carId, isActive: true });
  if (!car) throw new ApiError(404, 'Car not found');

  const start = from || todayInIndia();
  const end = to || addDays(start, MAX_DAYS_AHEAD);
  const bookings = await Booking.find(overlapFilter(carId, start, end))
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
