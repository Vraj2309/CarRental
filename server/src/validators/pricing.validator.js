import { z } from 'zod';
import { parseDay } from '../utils/dates.js';

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

export const quoteQuerySchema = z
  .object({ startDate: day, endDate: day })
  .refine((q) => q.endDate > q.startDate, {
    message: 'Return date must be after pickup date',
    path: ['endDate'],
  });

export const recommendationsQuerySchema = z.object({
  city: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});
