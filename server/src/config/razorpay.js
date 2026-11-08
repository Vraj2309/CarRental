import Razorpay from 'razorpay';
import { env } from './env.js';

// Like Cloudinary: optional at startup. Without keys, everything else works
// and only the payment routes answer "503 not configured".
export const razorpayEnabled = Boolean(env.razorpay.keyId && env.razorpay.keySecret);

export const razorpay = razorpayEnabled
  ? new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret })
  : null;

if (!razorpayEnabled) {
  console.warn(
    env.nodeEnv === 'development'
      ? 'Razorpay keys not set: using MOCK payments (POST /api/payments/mock-confirm)'
      : 'Razorpay keys not set: payments are disabled'
  );
}
