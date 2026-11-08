import crypto from 'node:crypto';

// THE security check of the payments phase.
//
// Razorpay signs every successful payment with our Key Secret:
//     signature = HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)
// Only Razorpay and our server know the secret. We compute the signature
// ourselves and compare. Someone faking "payment successful" from the browser
// cannot produce a matching signature without the secret.
//
// timingSafeEqual compares in constant time. A normal === stops at the first
// different character, and that tiny time difference can leak how many
// characters were right (a "timing attack").
export function isValidSignature(orderId, paymentId, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
