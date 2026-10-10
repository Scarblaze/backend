// Creates (or resets the password of) the first doctor/admin account.
//   SEED_EMAIL, SEED_PASSWORD (required), SEED_NAME, SEED_ROLE=doctor|admin   — see .env.example
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { User } from '../models/User.js';

const email = (process.env.SEED_EMAIL || '').trim().toLowerCase();
const password = process.env.SEED_PASSWORD || '';
const role = process.env.SEED_ROLE || 'doctor';

if (!email || password.length < 8 || !['doctor', 'admin'].includes(role)) {
  console.error('Set SEED_EMAIL, SEED_PASSWORD (min 8 chars) and optionally SEED_ROLE=doctor|admin.');
  process.exit(1);
}

await connectDB();
const passwordHash = await User.hashPassword(password);
const existing = await User.findOne({ email });
if (existing) {
  existing.passwordHash = passwordHash;
  existing.role = role;
  existing.accountStatus = 'active';
  await existing.save();
  console.log(`Updated ${role} ${email}`);
} else {
  await User.create({ name: process.env.SEED_NAME || 'Dr. AIIMS Nephrologist', email, passwordHash, role });
  console.log(`Created ${role} ${email}`);
}
await mongoose.disconnect();
