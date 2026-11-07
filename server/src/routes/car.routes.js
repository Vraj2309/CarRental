import { Router } from 'express';
import { listCars, getCar, createCar, updateCar, deleteCar } from '../controllers/car.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/auth.js';
import { createCarSchema, updateCarSchema, listCarsQuerySchema } from '../validators/car.validator.js';

const router = Router();

// Public: anyone can browse cars, no login needed.
router.get('/', validate(listCarsQuerySchema, 'query'), listCars);
router.get('/:id', getCar);

// Admin only: protect (who are you?) runs before authorize (are you allowed?).
router.post('/', protect, authorize('admin'), validate(createCarSchema), createCar);
router.patch('/:id', protect, authorize('admin'), validate(updateCarSchema), updateCar);
router.delete('/:id', protect, authorize('admin'), deleteCar);

export default router;
