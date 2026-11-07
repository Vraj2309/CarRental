import { asyncHandler } from '../utils/asyncHandler.js';
import * as carService from '../services/car.service.js';

export const listCars = asyncHandler(async (req, res) => {
  const result = await carService.listCars(req.validatedQuery);
  res.json({ success: true, data: result });
});

export const getCar = asyncHandler(async (req, res) => {
  const car = await carService.getCarById(req.params.id);
  res.json({ success: true, data: { car } });
});

export const createCar = asyncHandler(async (req, res) => {
  const car = await carService.createCar(req.body, req.user._id);
  res.status(201).json({ success: true, data: { car } });
});

export const updateCar = asyncHandler(async (req, res) => {
  const car = await carService.updateCar(req.params.id, req.body);
  res.json({ success: true, data: { car } });
});

export const deleteCar = asyncHandler(async (req, res) => {
  await carService.deactivateCar(req.params.id);
  res.json({ success: true, message: 'Car removed from listings' });
});
