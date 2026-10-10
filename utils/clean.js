import mongoose from 'mongoose';

export const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v);
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const str = (v) => (v === undefined || v === null ? '' : String(v));

export function toInt(v, fallback = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Keys with "." or a leading "$" are unsafe as MongoDB field names (and "$" enables operator injection).
const safeKey = (k) => !k.includes('.') && !k.startsWith('$');

// { fluid1_5_2L: 4, ... } -> keep only finite numeric values under safe keys
export function cleanCounts(obj) {
  if (!isPlainObject(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (safeKey(k) && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

// Free-form map of primitives (the "others" materials list)
export function cleanPrimitives(obj) {
  if (!isPlainObject(obj)) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (safeKey(k) && ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
  }
  return out;
}

export const pick = (obj, keys) => {
  const out = {};
  if (!isPlainObject(obj)) return out;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};
