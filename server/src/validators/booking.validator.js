import { z } from 'zod';
import mongoose from 'mongoose';
import { parseDay } from '../utils/dates.js';
import { BOOKING_STATUSES } from '../models/Booking.js';

const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: 'Invalid id' });

// "YYYY-MM-DD" that is a real calendar day; converted to a Date.
const day = z
  .string()
  .trim()
  .transform((text, ctx) => {
    const date = parseDay(text);
    if (!date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a real date as YYYY-MM-DD' });
      return z.NEVER;
    }
    return date;
  });

// Only the shape is checked here. Business rules (not in the past, max 30
// days...) live in the service, because they depend on "today".
export const createBookingSchema = z
  .object({
    carId: objectId,
    startDate: day,
    endDate: day,
  })
  .refine((b) => b.endDate > b.startDate, {
    message: 'Return date must be after pickup date',
    path: ['endDate'],
  });

export const bookedDatesQuerySchema = z.object({
  from: day.optional(),
  to: day.optional(),
});

export const adminListQuerySchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  car: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
