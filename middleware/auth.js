import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { HttpError, ah } from '../utils/errors.js';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new HttpError(500, 'Server misconfigured: JWT_SECRET is missing or too short');
  }
  return secret;
}

// Login lifetimes.
//  - Web portal (browser): short, JWT_EXPIRES_IN, default 12h.
//  - Flutter app (doctor/patient only): long, JWT_MOBILE_EXPIRES_IN, default 30d. The app has no
//    token refresh and does not log out on a 401, so a short token would leave users stuck on a
//    home screen where every request fails.
const APP_ROLES = new Set(['doctor', 'patient']);
const webTtl = () => process.env.JWT_EXPIRES_IN || '12h';
const appTtl = () => process.env.JWT_MOBILE_EXPIRES_IN || '30d';

// Browsers always send an Origin header on the login POST; the Flutter app (dart:io / http) never does.
// This only picks a lifetime. It is not an access control: nobody gains access they don't have credentials for.
export const isNativeClient = (req) => Boolean(req?.headers) && !req.headers.origin;

// Pass the request to get the app lifetime when it comes from the app. Without a request
// (e.g. invitation activation in routes/hospitals.js) the short web lifetime is used.
export function signToken(user, req) {
  const app = isNativeClient(req) && APP_ROLES.has(user.role);
  return jwt.sign({ id: String(user._id), role: user.role, client: app ? 'app' : 'web' }, getJwtSecret(), {
    expiresIn: app ? appTtl() : webTtl(),
  });
}

export const protect = ah(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Not authorized, token missing');

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'Session expired or invalid. Please log in again.');
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new HttpError(401, 'User no longer exists');
  if (user.accountStatus !== 'active') throw new HttpError(403, 'Account is suspended');
  req.user = user;
  next();
});

export const restrictTo =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Permission denied for this role'));
    }
    next();
  };
