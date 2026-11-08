import mongoose from 'mongoose';

// Life of a booking:
//
//   pending ──pay──► confirmed ──trip ends──► completed
//      │                 │
//      │ 15 min, unpaid  └──cancel──► cancelled (+ refund)
//      ▼
//   expired
export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'expired'];

export const HOLD_MINUTES = 15;

// Which bookings block a car's dates?
//  - confirmed bookings, always
//  - pending bookings, but ONLY while their 15-minute hold is still running
// Checking holdExpiresAt here means an unpaid booking stops blocking the car
// the very second its hold ends, even if the cleanup job has not run yet.
//
// Two date ranges overlap when each one starts before the other ends:
//   existing:  |=======|          start < newEnd  AND  end > newStart
//   new:           |=======|
// The return day is free, so 10th->13th and 13th->15th do not clash.
export function blockingFilter(carId, start, end, now = new Date()) {
  return {
    car: carId,
    startDate: { $lt: end },
    endDate: { $gt: start },
    $or: [{ status: 'confirmed' }, { status: 'pending', holdExpiresAt: { $gt: now } }],
  };
}

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: String }, // Razorpay order (created before the popup opens)
    paymentId: { type: String }, // Razorpay payment (exists once the user paid)
    amount: { type: Number }, // in PAISE: ₹13,500 = 1350000
    status: { type: String, enum: ['created', 'paid', 'refunded', 'refund_failed'] },
    paidAt: { type: Date },
    refundId: { type: String },
    refundedAt: { type: Date },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: 'Car', required: true },

    // Whole days at midnight UTC. startDate = pickup day, endDate = return day.
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 1 },

    // Price SNAPSHOT: copied from the car when booking, so later price
    // changes never affect a booking the user already agreed to.
    pricePerDay: { type: Number, required: true },
    totalPrice: { type: Number, required: true },

    status: { type: String, enum: BOOKING_STATUSES, default: 'pending' },
    holdExpiresAt: { type: Date }, // only meaningful while pending
    cancelledAt: { type: Date },
    payment: { type: paymentSchema },
  },
  { timestamps: true }
);

// Overlap check: "bookings of THIS car that touch these dates".
bookingSchema.index({ car: 1, startDate: 1, endDate: 1, status: 1 });
// "My bookings", newest first.
bookingSchema.index({ user: 1, createdAt: -1 });
// Cleanup job: "pending bookings whose hold has ended".
bookingSchema.index({ status: 1, holdExpiresAt: 1 });
// One Razorpay order belongs to exactly one booking. "partial" means the rule
// only applies to bookings that HAVE an order id (unpaid ones don't yet).
bookingSchema.index(
  { 'payment.orderId': 1 },
  { unique: true, partialFilterExpression: { 'payment.orderId': { $type: 'string' } } }
);

bookingSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Booking = mongoose.model('Booking', bookingSchema);
