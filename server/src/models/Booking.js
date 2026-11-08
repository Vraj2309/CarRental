import mongoose from 'mongoose';

// Phase 4 (payments) will add "pending" for bookings awaiting payment.
export const BOOKING_STATUSES = ['confirmed', 'cancelled', 'completed'];

// Statuses that block the car's dates. A cancelled booking frees them again.
export const BLOCKING_STATUSES = ['confirmed'];

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: 'Car', required: true },

    // Dates are whole days stored at midnight UTC.
    // startDate = pickup day, endDate = return day.
    // A 10th -> 13th booking is 3 days, and the car is free again on the 13th,
    // so someone else can pick it up that same day.
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 1 },

    // Price SNAPSHOT: copied from the car when booking. If the admin raises
    // the car's price tomorrow, this booking still costs what the user agreed to.
    pricePerDay: { type: Number, required: true },
    totalPrice: { type: Number, required: true },

    status: { type: String, enum: BOOKING_STATUSES, default: 'confirmed' },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// For the overlap check: "active bookings of THIS car that touch these dates".
bookingSchema.index({ car: 1, status: 1, startDate: 1, endDate: 1 });
// For "My bookings", newest first.
bookingSchema.index({ user: 1, createdAt: -1 });

bookingSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Booking = mongoose.model('Booking', bookingSchema);
