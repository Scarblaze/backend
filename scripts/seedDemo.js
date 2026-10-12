// Explicitly guarded demo data for a non-production Atlas database.
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { User } from '../models/User.js';
import { Hospital } from '../models/Hospital.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { PatientHospitalRelationship } from '../models/PatientHospitalRelationship.js';
import { MedicalProfile } from '../models/MedicalProfile.js';
import { BaselineAssessment } from '../models/BaselineAssessment.js';
import { TreatmentPlanVersion } from '../models/TreatmentPlanVersion.js';
import { PatientConsent } from '../models/PatientConsent.js';

if (process.env.SEED_DEMO_CONFIRM !== 'YES') throw new Error('Set SEED_DEMO_CONFIRM=YES to seed demo data');
const password = process.env.SEED_DEMO_PASSWORD || '';
if (password.length < 8) throw new Error('SEED_DEMO_PASSWORD must be at least 8 characters');

await connectDB();
const hash = await User.hashPassword(password);
const user = async (email, name, role) => User.findOneAndUpdate({ email }, { $set: { name, role, passwordHash: hash, accountStatus: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
const platform = await user(process.env.SEED_PLATFORM_EMAIL || 'platform.demo@example.com', 'Platform Demo Admin', 'platform_admin');
const admin = await user(process.env.SEED_HOSPITAL_ADMIN_EMAIL || 'hospital.admin.demo@example.com', 'Hospital Demo Admin', 'hospital_admin');
const doctor = await user(process.env.SEED_DOCTOR_EMAIL || 'doctor.demo@example.com', 'Dr. PD Demo', 'doctor');
const patient = await user(process.env.SEED_PATIENT_EMAIL || 'patient.demo@example.com', 'PD Demo Patient', 'patient');
const hospital = await Hospital.findOneAndUpdate({ code: (process.env.SEED_DEMO_HOSPITAL_CODE || 'PD-DEMO').toUpperCase() }, { $set: { name: process.env.SEED_DEMO_HOSPITAL_NAME || 'PD Demo Hospital', status: 'active', createdBy: platform._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
await HospitalMembership.bulkWrite([
  { updateOne: { filter: { hospital: hospital._id, user: admin._id }, update: { $set: { role: 'hospital_admin', status: 'active' } }, upsert: true } },
  { updateOne: { filter: { hospital: hospital._id, user: doctor._id }, update: { $set: { role: 'doctor', status: 'active' } }, upsert: true } },
  { updateOne: { filter: { hospital: hospital._id, user: patient._id }, update: { $set: { role: 'patient', status: 'active', mrn: 'PD-DEMO-001' } }, upsert: true } },
]);
await PatientHospitalRelationship.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: { mrn: 'PD-DEMO-001', status: 'active', primaryDoctor: doctor._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
const plan = { patient: patient._id, hospital: hospital._id, primaryDiagnosis: 'End-stage kidney disease', dialysisType: 'CAPD', pdPrescription: [{ dwellTiming: 'Day', solutionStrength: '1.5%', fillVolume: 2000, dwellDurationHours: 4, numberOfExchanges: 4, icodextrinUsed: false }], planAndAdvice: { medications: 'Demo medication plan', followUpInstructions: 'Review in 30 days' }, updatedBy: doctor._id };
const baseline = await BaselineAssessment.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: plan }, { upsert: true, new: true, setDefaultsOnInsert: true });
await MedicalProfile.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: { age: 42, gender: 'F', dialysisType: 'CAPD', primaryDiagnosis: 'End-stage kidney disease', updatedBy: doctor._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
await TreatmentPlanVersion.findOneAndUpdate({ patient: patient._id, hospital: hospital._id, version: 1 }, { $set: { plan: baseline.toObject(), updatedBy: doctor._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
await PatientConsent.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: { scope: 'detailed', status: 'active', grantedAt: new Date(), revokedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true });
console.log(JSON.stringify({ hospital: hospital.code, admin: admin.email, doctor: doctor.email, patient: patient.email }));
await mongoose.disconnect();
