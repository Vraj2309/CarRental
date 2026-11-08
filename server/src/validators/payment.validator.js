import { z } from 'zod';
import mongoose from 'mongoose';

export const createOrderSchema = z.object({
  bookingId: z.string().refine((v) => mongoose.isValidObjectId(v), { message: 'Invalid booking id' }),
});

// Field names exactly as Razorpay's popup returns them, so the frontend can
// forward its response object unchanged.
export const verifyPaymentSchema = z
  .object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  })
  .transform((b) => ({
    orderId: b.razorpay_order_id,
    paymentId: b.razorpay_payment_id,
    signature: b.razorpay_signature,
  }));
