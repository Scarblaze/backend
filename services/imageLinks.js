import crypto from 'node:crypto';
import { getJwtSecret } from '../middleware/auth.js';

// Signed, expiring links for photos stored in MongoDB.
//
// The Flutter app loads photos with a plain Image.network(url) and cannot send an
// Authorization header, so every photo URL the API returns carries its own short-lived
// signature. The web portal (and anyone else) can still fetch the bare URL with a Bearer
// token and gets the full patient-access check instead.

const BUCKET_SECONDS = 60 * 60; // expiry is rounded up to the hour so a URL stays identical between refreshes (keeps Flutter's image cache working)

function ttlSeconds() {
  const n = Number(process.env.IMAGE_LINK_TTL_SECONDS);
  return Number.isFinite(n) && n >= 60 ? Math.floor(n) : 24 * 60 * 60;
}

// Separate key derived from JWT_SECRET so an image signature can never be confused with a login token.
const signingKey = () => crypto.createHmac('sha256', getJwtSecret()).update('image-link-v1').digest();
const mac = (token, exp) => crypto.createHmac('sha256', signingKey()).update(`${token}.${exp}`).digest('base64url');

export function signedImageUrl(base, token, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const exp = Math.ceil(nowSec / BUCKET_SECONDS) * BUCKET_SECONDS + ttlSeconds();
  return `${base}/api/images/${token}?exp=${exp}&sig=${mac(token, exp)}`;
}

export function verifyImageLink(token, exp, sig, nowMs = Date.now()) {
  if (typeof token !== 'string' || typeof exp !== 'string' || typeof sig !== 'string') return false;
  if (!/^\d{1,12}$/.test(exp)) return false;
  const expSec = Number(exp);
  if (expSec < Math.floor(nowMs / 1000)) return false;
  const expected = Buffer.from(mac(token, expSec));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
