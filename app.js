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
import hospitalRoutes from './routes/hospitals.js';
import auditRoutes from './routes/audit.js';
import breakGlassRoutes from './routes/breakGlass.js';
import consentRoutes from './routes/consent.js';
import patientHistoryRoutes from './routes/patientHistory.js';
import transferRoutes from './routes/transfers.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
app.set('trust proxy', 1); // Vercel terminates TLS; needed for correct https image URLs
app.disable('x-powered-by');

const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const localOrigins = new Set(['http://localhost:5174', 'http://127.0.0.1:5174']);
app.use(cors({ origin: (origin, callback) => { if (!origin || origins.includes(origin) || (!origins.length && localOrigins.has(origin))) return callback(null, true); return callback(new Error('Origin not allowed')); } }));
app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); next(); });
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
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/audit-events', auditRoutes);
app.use('/api/break-glass', breakGlassRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/patients', patientHistoryRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
