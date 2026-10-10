export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 does not catch rejected promises from async handlers.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
