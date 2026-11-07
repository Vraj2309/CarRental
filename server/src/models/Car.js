import mongoose from 'mongoose';

// Allowed values live in one place, so the model, the validators and
// (later) the frontend dropdowns all agree.
export const CAR_TYPES = ['hatchback', 'sedan', 'suv', 'muv', 'luxury'];
export const FUEL_TYPES = ['petrol', 'diesel', 'cng', 'electric'];
export const TRANSMISSIONS = ['manual', 'automatic'];

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String }, // Cloudinary id, needed to delete the file later (Phase 2B)
  },
  { _id: false }
);

const carSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    type: { type: String, enum: CAR_TYPES, required: true },
    seats: { type: Number, required: true, min: 2, max: 9 },
    fuel: { type: String, enum: FUEL_TYPES, required: true },
    transmission: { type: String, enum: TRANSMISSIONS, required: true },
    city: { type: String, required: true, trim: true },
    // Price is stored in whole rupees. Never store money as a float:
    // 0.1 + 0.2 !== 0.3 in JavaScript.
    pricePerDay: { type: Number, required: true, min: 0 },
    features: [{ type: String, trim: true }],
    images: [imageSchema],
    // Soft delete: hidden cars keep their history (old bookings still point here).
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Compound index matching the most common search: active cars in a city,
// optionally filtered by type and sorted by price. Without an index MongoDB
// scans every car (a "COLLSCAN"); with it, it jumps straight to the matches.
carSchema.index({ isActive: 1, city: 1, type: 1, pricePerDay: 1 });

carSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Car = mongoose.model('Car', carSchema);
