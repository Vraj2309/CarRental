import { z } from 'zod';
import { CAR_TYPES, FUEL_TYPES, TRANSMISSIONS } from '../models/Car.js';

const currentYear = new Date().getFullYear();

// ---------- Body: creating / updating a car (admin) ----------
export const createCarSchema = z.object({
  brand: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(40),
  year: z.number().int().min(2010).max(currentYear + 1),
  type: z.enum(CAR_TYPES),
  seats: z.number().int().min(2).max(9),
  fuel: z.enum(FUEL_TYPES),
  transmission: z.enum(TRANSMISSIONS),
  city: z.string().trim().min(2).max(40),
  pricePerDay: z.number().int('Price must be whole rupees').min(500).max(50000),
  features: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  images: z
    .array(z.object({ url: z.string().url(), publicId: z.string().optional() }))
    .max(8)
    .default([]),
});

// PATCH = partial update: every field optional, but at least one must be sent.
export const updateCarSchema = createCarSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Send at least one field to update',
  });

// ---------- Query string: searching cars (public) ----------
// Everything in a URL arrives as a string ("3000"), so z.coerce converts
// it to a number before checking it.
export const listCarsQuerySchema = z
  .object({
    city: z.string().trim().min(1).optional(),
    type: z.enum(CAR_TYPES).optional(),
    fuel: z.enum(FUEL_TYPES).optional(),
    transmission: z.enum(TRANSMISSIONS).optional(),
    seats: z.coerce.number().int().min(2).max(9).optional(), // minimum seats
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    q: z.string().trim().min(1).max(50).optional(), // free-text: brand or model
    sort: z.enum(['price_asc', 'price_desc', 'newest']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12), // cap stops ?limit=1000000
  })
  .refine((d) => d.minPrice === undefined || d.maxPrice === undefined || d.minPrice <= d.maxPrice, {
    message: 'minPrice cannot be greater than maxPrice',
    path: ['minPrice'],
  });
