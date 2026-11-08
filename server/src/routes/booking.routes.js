import { Router } from 'express';
import {
  createBooking,
  myBookings,
  getBooking,
  cancelBooking,
  listAllBookings,
} from '../controllers/booking.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, authorize } from '../middleware/auth.js';
import { createBookingSchema, adminListQuerySchema } from '../validators/booking.validator.js';

const router = Router();

// Every booking route needs a logged-in user, so protect runs for all of them.
router.use(protect);

router.post('/', validate(createBookingSchema), createBooking);

// '/me' must be defined BEFORE '/:id'. Express checks routes in order, and
// '/:id' would otherwise catch "me" as if it were a booking id.
router.get('/me', myBookings);
router.get('/', authorize('admin'), validate(adminListQuerySchema, 'query'), listAllBookings);
router.get('/:id', getBooking);
router.patch('/:id/cancel', cancelBooking);

export default router;
