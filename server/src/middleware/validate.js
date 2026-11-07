import { ApiError } from '../utils/ApiError.js';

// Reusable middleware: validate part of the request against a zod schema.
//   validate(schema)          -> checks req.body
//   validate(schema, 'query') -> checks req.query (the ?key=value part of the URL)
//
// On success the clean, converted data is stored back on the request:
//   body  -> req.body          (unknown fields such as "role": "admin" are dropped)
//   query -> req.validatedQuery (numbers are real numbers, defaults are filled in)
// We use a separate property for the query because req.query is read-only
// in newer Express versions.
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new ApiError(400, 'Validation failed', details));
    }
    if (source === 'query') req.validatedQuery = result.data;
    else req.body = result.data;
    next();
  };
