import mongoose from 'mongoose';

// Reuse one connection across warm serverless invocations.
const cache = (globalThis.__mongooseCache ??= { conn: null, promise: null });

export default async function connectDB() {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 })
      .then((m) => m);
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    cache.conn = null;
    throw err;
  }
  return cache.conn;
}
