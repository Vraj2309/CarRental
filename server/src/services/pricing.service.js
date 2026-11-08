import { Booking, blockingFilter } from '../models/Booking.js';
import { Car } from '../models/Car.js';
import { callMl } from '../utils/mlClient.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { todayInIndia, formatDay, addDays, daysBetween } from '../utils/dates.js';

// Live utilisation: what share of similar cars (same city + type) is already
// taken for these dates? e.g. 4 of 5 Ahmedabad SUVs booked -> 0.8.
// This is real-time data the model can't know, so it is sent along.
async function liveUtilisation(car, start, end) {
  const similar = await Car.find({
    isActive: true,
    type: car.type,
    city: new RegExp(`^${escapeRegex(car.city)}$`, 'i'),
  })
    .select('_id')
    .lean();
  if (similar.length === 0) return 0;

  const ids = similar.map((c) => c._id);
  const busy = await Booking.distinct('car', blockingFilter({ $in: ids }, start, end));
  return busy.length / similar.length;
}

// Flat base price: used when the ML service is unavailable.
function fallbackQuote(car, start, end) {
  const days = daysBetween(start, end);
  return {
    source: 'fallback',
    totalPrice: days * car.pricePerDay,
    avgMultiplier: 1,
    days: Array.from({ length: days }, (_, i) => ({
      date: formatDay(addDays(start, i)),
      multiplier: 1,
      price: car.pricePerDay,
    })),
    reasons: ['Standard price'],
    modelVersion: null,
  };
}

// car must include: city, type, pricePerDay
export async function quoteForCar(car, start, end) {
  const utilisation = await liveUtilisation(car, start, end);
  const ml = await callMl('/price/quote', {
    city: car.city,
    carType: car.type,
    basePrice: car.pricePerDay,
    startDate: formatDay(start),
    endDate: formatDay(end),
    bookingDate: formatDay(todayInIndia()), // India's "today", not the server's
    liveUtilisation: Number(utilisation.toFixed(3)),
  });

  if (!ml || !Number.isInteger(ml.totalPrice) || ml.totalPrice <= 0) {
    return fallbackQuote(car, start, end);
  }
  return { source: 'ml', ...ml };
}
