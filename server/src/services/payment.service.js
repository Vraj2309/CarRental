import mongoose from 'mongoose';
import { isValidSignature } from '../utils/razorpaySignature.js';
import { env } from '../config/env.js';
import { razorpay, razorpayEnabled } from '../config/razorpay.js';
import { Booking, blockingFilter } from '../models/Booking.js';
import { Car } from '../models/Car.js';
import { ApiError } from '../utils/ApiError.js';

function assertEnabled() {
  if (!razorpayEnabled) throw new ApiError(503, 'Payments are not configured on this server');
}

// The Razorpay SDK throws plain objects ({ statusCode, error: {...} }), not
// Error instances. Convert them so our error handler shows a clear message
// instead of a confusing status copied from Razorpay.
async function callRazorpay(fn) {
  try {
    return await fn();
  } catch (err) {
    const reason = err?.error?.description || err?.message || 'unknown error';
    console.error('Razorpay error:', reason);
    throw new ApiError(502, `Payment provider error: ${reason}`);
  }
}

// Step 1: create (or reuse) a Razorpay order for a pending booking.
export async function createOrder(bookingId, user) {
  assertEnabled();
  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.user.equals(user._id)) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'pending') throw new ApiError(400, `This booking is already ${booking.status}`);
  if (booking.holdExpiresAt <= new Date()) {
    throw new ApiError(400, 'Payment window expired. Please book again.');
  }

  let current = booking;
  // Reuse the existing order if the user refreshed the page or clicked twice;
  // otherwise one booking could end up with several orders.
  if (!booking.payment?.orderId) {
    // The AMOUNT comes from our database, never from the browser.
    const amount = booking.totalPrice * 100; // rupees -> paise
    const order = await callRazorpay(() =>
      razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt: booking._id.toString(),
        notes: { bookingId: booking._id.toString() },
      })
    );

    // Save only if no other request saved an order first (conditional update).
    current =
      (await Booking.findOneAndUpdate(
        { _id: booking._id, 'payment.orderId': { $exists: false } },
        { $set: { payment: { orderId: order.id, amount, status: 'created' } } },
        { new: true }
      )) || (await Booking.findById(booking._id));
  }

  return {
    keyId: env.razorpay.keyId, // public key, safe for the browser
    orderId: current.payment.orderId,
    amount: current.payment.amount,
    currency: 'INR',
    bookingId: current._id,
    holdExpiresAt: current.holdExpiresAt,
  };
}

// Refund a paid booking in full. Never throws: a failed refund is recorded
// as "refund_failed" so an admin can retry it, and the caller carries on.
export async function refundBooking(booking, paymentId = booking.payment?.paymentId) {
  if (!paymentId) return false;

  // Mock payment: no real money, so just record a mock refund.
  if (paymentId.startsWith('mock_')) {
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          'payment.paymentId': paymentId,
          'payment.status': 'refunded',
          'payment.refundId': `mock_refund_${Date.now()}`,
          'payment.refundedAt': new Date(),
        },
      }
    );
    return true;
  }

  if (!razorpayEnabled) return false;
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: booking.payment.amount,
      notes: { bookingId: booking._id.toString() },
    });
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          'payment.paymentId': paymentId,
          'payment.status': 'refunded',
          'payment.refundId': refund.id,
          'payment.refundedAt': new Date(),
        },
      }
    );
    return true;
  } catch (err) {
    console.error('Refund failed for booking', booking._id.toString(), err?.error?.description || err);
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { 'payment.paymentId': paymentId, 'payment.status': 'refund_failed' } }
    );
    return false;
  }
}

// Step 2: the browser reports a payment. Verify it, then confirm the booking.
export async function verifyPayment(user, { orderId, paymentId, signature }) {
  assertEnabled();

  // 1) Is the signature genuine? (see utils/razorpaySignature.js)
  if (!isValidSignature(orderId, paymentId, signature, env.razorpay.keySecret)) {
    throw new ApiError(400, 'Payment verification failed');
  }

  const booking = await Booking.findOne({ 'payment.orderId': orderId });
  if (!booking || !booking.user.equals(user._id)) throw new ApiError(404, 'Booking not found');

  // Idempotent: the same verification sent twice just returns the booking.
  if (booking.status === 'confirmed' && booking.payment.paymentId === paymentId) return booking;

  // 2) Ask Razorpay directly: right order? right amount? money captured?
  let payment = await callRazorpay(() => razorpay.payments.fetch(paymentId));
  if (payment.order_id !== orderId || payment.amount !== booking.payment.amount) {
    throw new ApiError(400, 'Payment does not match this booking');
  }
  // "authorized" = the bank approved it but the money is not taken yet.
  if (payment.status === 'authorized') {
    payment = await callRazorpay(() => razorpay.payments.capture(paymentId, payment.amount, 'INR'));
  }
  if (payment.status !== 'captured') throw new ApiError(402, 'Payment was not completed');

  // The user paid, but the booking was cancelled meanwhile: give the money back.
  if (!['pending', 'expired'].includes(booking.status)) {
    await refundBooking(booking, paymentId);
    throw new ApiError(409, `This booking is ${booking.status}. Your payment has been refunded.`);
  }

  // 3) Confirm the booking (race-safe).
  return confirmPaidBooking(booking, { paymentId });
}

// Shared by real and mock payments: mark a paid booking confirmed, using the
// same race-safe transaction as booking creation. Normally the hold
// guarantees the dates are free. But if the user paid AFTER the 15 minutes,
// someone else may have booked those dates since; then we refund instead.
async function confirmPaidBooking(booking, { paymentId, orderId, amount }) {
  const session = await mongoose.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      await Car.updateOne({ _id: booking.car }, { $inc: { bookingVersion: 1 } }, { session });

      const clash = await Booking.exists({
        ...blockingFilter(booking.car, booking.startDate, booking.endDate),
        _id: { $ne: booking._id }, // ignore this booking itself
      }).session(session);

      if (clash) {
        await Booking.updateOne(
          { _id: booking._id },
          { $set: { status: 'expired', 'payment.paymentId': paymentId, 'payment.status': 'paid' } },
          { session }
        );
        outcome = 'clash';
        return;
      }

      const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: { $in: ['pending', 'expired'] } },
        {
          $set: {
            status: 'confirmed',
            'payment.paymentId': paymentId,
            'payment.status': 'paid',
            'payment.paidAt': new Date(),
            // Mock payments have no Razorpay order, so they pass these in.
            ...(orderId && { 'payment.orderId': orderId }),
            ...(amount && { 'payment.amount': amount }),
          },
          $unset: { holdExpiresAt: 1 },
        },
        { session }
      );
      outcome = updated ? 'confirmed' : 'changed';
    });
  } finally {
    await session.endSession();
  }

  if (outcome !== 'confirmed') {
    // Refund OUTSIDE the transaction: an external API call cannot be rolled back.
    await refundBooking(booking, paymentId);
    throw new ApiError(
      409,
      'Sorry, these dates were booked while you were paying. Your payment has been refunded.'
    );
  }

  return Booking.findById(booking._id).populate('car', 'brand model type city images pricePerDay');
}

// ---------------------------------------------------------------------------
// MOCK PAYMENTS: development only, and only when Razorpay keys are missing.
// Lets the full booking flow (pending -> confirmed -> cancelled/refunded) be
// tested without a Razorpay account. Every mock id starts with "mock_", so a
// mock payment can never be mistaken for a real one.
// ---------------------------------------------------------------------------
export const mockPaymentsEnabled = env.nodeEnv === 'development' && !razorpayEnabled;

export async function mockConfirm(bookingId, user) {
  if (!mockPaymentsEnabled) throw new ApiError(404, 'Route not found');

  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.user.equals(user._id)) throw new ApiError(404, 'Booking not found');
  // Same rules as a real order: only a pending booking whose hold is running.
  if (booking.status !== 'pending') throw new ApiError(400, `This booking is already ${booking.status}`);
  if (booking.holdExpiresAt <= new Date()) {
    throw new ApiError(400, 'Payment window expired. Please book again.');
  }

  const stamp = Date.now();
  return confirmPaidBooking(booking, {
    paymentId: `mock_pay_${stamp}`,
    orderId: `mock_order_${booking._id}`,
    amount: booking.totalPrice * 100, // paise, same as real payments
  });
}
