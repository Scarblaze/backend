import 'dotenv/config';
import app from '../app.js';
import connectDB from '../config/db.js';
import mongoose from 'mongoose';

await connectDB();
const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}/api`;
async function call(path, options = {}) { const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined }); return { status: response.status, data: await response.json().catch(() => ({})) }; }
try {
  const platform = await call('/auth/login', { method: 'POST', body: { email: process.env.SEED_PLATFORM_EMAIL || 'platform.demo@example.com', password: process.env.SEED_DEMO_PASSWORD || 'DemoPD-2026!' } });
  const doctor = await call('/auth/login', { method: 'POST', body: { email: process.env.SEED_DOCTOR_EMAIL || 'doctor.demo@example.com', password: process.env.SEED_DEMO_PASSWORD || 'DemoPD-2026!' } });
  if (platform.status !== 200 || doctor.status !== 200) throw new Error(`Demo login failed: platform=${platform.status}, doctor=${doctor.status}`);
  const health = await call('/health');
  const stats = await call('/hospitals/platform/overview', { token: platform.data.token });
  const hospitals = await call('/hospitals', { token: doctor.data.token });
  const hospitalId = hospitals.data.hospitals?.[0]?._id;
  if (!hospitalId) throw new Error('No hospital returned for doctor');
  const overview = await call(`/hospitals/${hospitalId}/overview`, { token: doctor.data.token });
  const worklist = await call(`/hospitals/${hospitalId}/doctor-worklist`, { token: doctor.data.token });
  const notifications = await call('/notifications', { token: doctor.data.token });
  const checks = { health: health.status === 200, platformStats: stats.status === 200, hospitalOverview: overview.status === 200, doctorWorklist: worklist.status === 200, notifications: notifications.status === 200 };
  if (!Object.values(checks).every(Boolean)) throw new Error(`Smoke checks failed: ${JSON.stringify(checks)}`);
  console.log(JSON.stringify({ success: true, checks, hospitalId }));
} finally { server.close(); await mongoose.disconnect(); }
