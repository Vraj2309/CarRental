import { Router } from 'express';
import {
  listCars,
  getCar,
  createCar,
  updateCar,
  deleteCar,
  uploadImages,
  deleteImage,
} from '../controllers/car.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/auth.js';
import { uploadCarImages } from '../middleware/upload.js';
import { createCarSchema, updateCarSchema, listCarsQuerySchema } from '../validators/car.validator.js';
import { bookedDates } from '../controllers/booking.controller.js';
import { bookedDatesQuerySchema } from '../validators/booking.validator.js';

const router = Router();

// Public: anyone can browse cars, no login needed.
router.get('/', validate(listCarsQuerySchema, 'query'), listCars);
router.get('/:id', getCar);
// Public calendar data: which days is this car already taken?
router.get('/:id/booked-dates', validate(bookedDatesQuerySchema, 'query'), bookedDates);

// Admin only: protect (who are you?) runs before authorize (are you allowed?).
const adminOnly = [protect, authorize('admin')];

router.post('/', ...adminOnly, validate(createCarSchema), createCar);
router.patch('/:id', ...adminOnly, validate(updateCarSchema), updateCar);
router.delete('/:id', ...adminOnly, deleteCar);

// Images. uploadCarImages runs AFTER the auth checks, so a stranger's
// 5 MB files are rejected before we even read them into memory.
router.post('/:id/images', ...adminOnly, uploadCarImages, uploadImages);
router.delete('/:id/images/:imageId', ...adminOnly, deleteImage);

export default router;
