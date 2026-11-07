// A custom error that carries an HTTP status code.
// Throw it anywhere: throw new ApiError(404, 'Car not found')
// and the central error handler turns it into a proper JSON response.
export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}
