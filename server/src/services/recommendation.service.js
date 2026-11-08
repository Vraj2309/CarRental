import { Booking } from '../models/Booking.js';
import { Car } from '../models/Car.js';
import { callMl } from '../utils/mlClient.js';

const CAR_FIELDS = 'brand model type fuel transmission seats city pricePerDay images';
const MAX_CANDIDATES = 200;
const MAX_HISTORY_BOOKINGS = 5000;
const COUNTED = ['confirmed', 'completed']; // real rentals only, not unpaid holds

// userId is optional: logged-out visitors get popular cars.
export async function recommendCars({ userId, city, limit = 6 }) {
  const cars = await Car.find({ isActive: true }).select(CAR_FIELDS).limit(MAX_CANDIDATES).lean();
  if (cars.length === 0) return [];

  // Booking history of everyone, grouped per user: [[carA, carB], [carC], ...]
  // Capped to the most recent bookings so this stays fast as data grows.
  const perUser = await Booking.aggregate([
    { $match: { status: { $in: COUNTED } } },
    { $sort: { createdAt: -1 } },
    { $limit: MAX_HISTORY_BOOKINGS },
    { $group: { _id: '$user', cars: { $addToSet: '$car' } } },
  ]);
  const coBookings = perUser.map((u) => u.cars.map(String));
  const userCarIds = userId
    ? (perUser.find((u) => String(u._id) === String(userId))?.cars || []).map(String)
    : [];

  const ml = await callMl('/recommendations', {
    candidates: cars.map((c) => ({
      id: String(c._id),
      name: `${c.brand} ${c.model}`,
      type: c.type,
      fuel: c.fuel,
      transmission: c.transmission,
      seats: c.seats,
      city: c.city,
      pricePerDay: c.pricePerDay,
    })),
    userCarIds,
    coBookings,
    city,
    limit,
  });

  const byId = new Map(cars.map((c) => [String(c._id), c]));
  if (ml?.items) {
    return ml.items
      .filter((r) => byId.has(r.carId))
      .map((r) => ({ car: byId.get(r.carId), score: r.score, reason: r.reason, source: 'ml' }));
  }

  // Fallback: most-booked cars, preferring the requested city.
  const counts = new Map();
  for (const list of coBookings) for (const id of list) counts.set(id, (counts.get(id) || 0) + 1);
  const cityMatch = (c) => (city && c.city.toLowerCase() === city.toLowerCase() ? 1 : 0);
  return cars
    .filter((c) => !userCarIds.includes(String(c._id)))
    .sort((a, b) => cityMatch(b) - cityMatch(a) || (counts.get(String(b._id)) || 0) - (counts.get(String(a._id)) || 0))
    .slice(0, limit)
    .map((c) => ({ car: c, score: null, reason: `Popular in ${c.city}`, source: 'fallback' }));
}
