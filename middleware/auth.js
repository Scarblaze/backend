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

export const signToken = (user) =>
  jwt.sign({ id: String(user._id), role: user.role }, getJwtSecret(), { expiresIn: '30d' });

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
