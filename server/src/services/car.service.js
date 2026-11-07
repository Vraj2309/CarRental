import { Car } from '../models/Car.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const SORTS = {
  price_asc: { pricePerDay: 1, _id: 1 },
  price_desc: { pricePerDay: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
};
// _id is added to every sort as a tie-breaker. Without it, two cars with the
// same price can swap places between pages, so one car shows up twice and
// another never appears.

export async function listCars(query) {
  const { city, type, fuel, transmission, seats, minPrice, maxPrice, q, sort, page, limit } = query;

  // Build the MongoDB filter one condition at a time; only filters the
  // user actually sent are added.
  const filter = { isActive: true };
  if (city) filter.city = new RegExp(`^${escapeRegex(city)}$`, 'i'); // "ahmedabad" matches "Ahmedabad"
  if (type) filter.type = type;
  if (fuel) filter.fuel = fuel;
  if (transmission) filter.transmission = transmission;
  if (seats) filter.seats = { $gte: seats };
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.pricePerDay = {};
    if (minPrice !== undefined) filter.pricePerDay.$gte = minPrice;
    if (maxPrice !== undefined) filter.pricePerDay.$lte = maxPrice;
  }
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ brand: rx }, { model: rx }];
  }

  // Pagination: page 3 with limit 12 skips the first 24 results.
  const skip = (page - 1) * limit;

  // Run both queries at the same time instead of one after the other.
  const [cars, total] = await Promise.all([
    Car.find(filter).sort(SORTS[sort]).skip(skip).limit(limit).lean(),
    Car.countDocuments(filter),
  ]);

  return {
    cars,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCarById(id, { includeInactive = false } = {}) {
  const car = await Car.findById(id).lean();
  // A hidden car looks exactly like a missing one to the public.
  if (!car || (!car.isActive && !includeInactive)) throw new ApiError(404, 'Car not found');
  return car;
}

export async function createCar(data, adminId) {
  return Car.create({ ...data, addedBy: adminId });
}

export async function updateCar(id, data) {
  // runValidators: apply the schema rules (enum, min, max) to updates too;
  // by default Mongoose only checks them on create.
  const car = await Car.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!car) throw new ApiError(404, 'Car not found');
  return car;
}

export async function deactivateCar(id) {
  const car = await Car.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!car) throw new ApiError(404, 'Car not found');
  return car;
}
