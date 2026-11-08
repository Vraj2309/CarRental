import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { Car } from '../models/Car.js';
import { quoteForCar } from '../services/pricing.service.js';
import { checkDateRules } from '../services/booking.service.js';
import { recommendCars } from '../services/recommendation.service.js';

// GET /api/cars/:id/quote?startDate=...&endDate=...
// Shows the price BEFORE booking. The same calculation runs again when the
// booking is created, and that price is the one locked in.
export const getQuote = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.validatedQuery;
  checkDateRules(startDate, endDate); // same rules as booking: no past dates etc.

  const car = await Car.findOne({ _id: req.params.id, isActive: true })
    .select('brand model city type pricePerDay')
    .lean();
  if (!car) throw new ApiError(404, 'Car not found');

  const quote = await quoteForCar(car, startDate, endDate);
  res.json({ success: true, data: { carId: car._id, basePricePerDay: car.pricePerDay, quote } });
});

// GET /api/recommendations?city=Ahmedabad&limit=6
export const getRecommendations = asyncHandler(async (req, res) => {
  const { city, limit } = req.validatedQuery;
  const items = await recommendCars({ userId: req.user?._id, city, limit });
  res.json({ success: true, data: { personalised: Boolean(req.user), items } });
});
