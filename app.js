import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { dartSafeJson } from './utils/json.js';
import { ah } from './utils/errors.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import imageRoutes from './routes/images.js';

const app = express();
app.set('trust proxy', 1); // Vercel terminates TLS; needed for correct https image URLs
app.disable('x-powered-by');

const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(dartSafeJson);
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => res.json({ status: 'AIIMS Digital Dialysis API running' }));

// Every API request needs the database; the connection is cached across warm invocations.
app.use('/api', ah(async (_req, _res, next) => { await connectDB(); next(); }));

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' })
);
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/images', imageRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
