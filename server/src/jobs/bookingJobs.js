import { Booking } from '../models/Booking.js';
import { todayInIndia } from '../utils/dates.js';

const EVERY_MINUTES = 5;

// Housekeeping only. Correctness does NOT depend on this job: an expired hold
// already stops blocking dates (see blockingFilter). The job just makes the
// stored status match reality, for "My bookings" and the admin list.
export async function runBookingJobs() {
  const now = new Date();
  const [expired, completed] = await Promise.all([
    Booking.updateMany(
      { status: 'pending', holdExpiresAt: { $lte: now } },
      { $set: { status: 'expired' } }
    ),
    // A trip is complete once its return day has arrived.
    Booking.updateMany(
      { status: 'confirmed', endDate: { $lte: todayInIndia() } },
      { $set: { status: 'completed' } }
    ),
  ]);
  if (expired.modifiedCount || completed.modifiedCount) {
    console.log(
      `Booking jobs: ${expired.modifiedCount} expired, ${completed.modifiedCount} completed`
    );
  }
}

export function startBookingJobs() {
  const run = () => runBookingJobs().catch((err) => console.error('Booking jobs failed:', err.message));
  run(); // once at startup
  // unref(): this timer alone will not keep Node running (clean shutdowns).
  setInterval(run, EVERY_MINUTES * 60 * 1000).unref();
}
