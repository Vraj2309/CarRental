import { Router } from 'express';
import { createOrder, verifyPayment, mockConfirm } from '../controllers/payment.controller.js';
import { validate } from '../middleware/validate.js';
import { protect } from '../middleware/auth.js';
import { mockPaymentsEnabled } from '../services/payment.service.js';
import { createOrderSchema, verifyPaymentSchema } from '../validators/payment.validator.js';

const router = Router();
router.use(protect);

// Real payments (need Razorpay keys)
router.post('/order', validate(createOrderSchema), createOrder);
router.post('/verify', validate(verifyPaymentSchema), verifyPayment);

// Mock payments: the route is only REGISTERED in development without keys.
// In production it does not exist at all, so it can never be abused.
if (mockPaymentsEnabled) {
  router.post('/mock-confirm', validate(createOrderSchema), mockConfirm);
}

export default router;
