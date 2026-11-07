// Express 4 does not catch errors thrown inside async functions.
// This wrapper forwards any rejected promise to next(err), so we never
// need try/catch in every controller.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
