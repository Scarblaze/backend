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
import { MaterialSession } from '../models/MaterialSession.js';
import { DialysisSession } from '../models/DialysisSession.js';
import { PatientTransfer } from '../models/PatientTransfer.js';
import { BreakGlassAccess } from '../models/BreakGlassAccess.js';
import { Notification } from '../models/Notification.js';
import { AuditEvent } from '../models/AuditEvent.js';

if (process.env.SEED_SYNTHETIC_CONFIRM !== 'YES') throw new Error('Set SEED_SYNTHETIC_CONFIRM=YES to seed synthetic data');
const password = process.env.SEED_SYNTHETIC_PASSWORD || 'SyntheticPD-2026!';
if (password.length < 8) throw new Error('SEED_SYNTHETIC_PASSWORD must be at least 8 characters');
const hospitalCount = Math.min(10, Math.max(2, Number(process.env.SYNTHETIC_HOSPITALS || 3)));
const patientsPerHospital = Math.min(50, Math.max(3, Number(process.env.SYNTHETIC_PATIENTS_PER_HOSPITAL || 10)));

await connectDB();
const hash = await User.hashPassword(password);
const users = [];
async function upsertUser(email, name, role) { return User.findOneAndUpdate({ email }, { $set: { name, role, passwordHash: hash, accountStatus: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true }); }
const platform = await upsertUser('synthetic.platform@example.com', 'Synthetic Platform Admin', 'platform_admin');
const hospitals = [];
for (let h = 1; h <= hospitalCount; h += 1) {
  const hospital = await Hospital.findOneAndUpdate({ code: `SYNTH-${String(h).padStart(2, '0')}` }, { $set: { name: `Synthetic PD Hospital ${h}`, address: `${h} Synthetic Avenue`, phone: `90000000${String(h).padStart(2, '2')}`, status: h === hospitalCount ? 'suspended' : 'active', createdBy: platform._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const admin = await upsertUser(`synthetic.admin${h}@example.com`, `Synthetic Hospital Admin ${h}`, 'hospital_admin');
  const doctor = await upsertUser(`synthetic.doctor${h}@example.com`, `Synthetic Doctor ${h}`, 'doctor');
  const assistant = await upsertUser(`synthetic.assistant${h}@example.com`, `Synthetic Assistant ${h}`, 'assistant_doctor');
  const nurse = await upsertUser(`synthetic.nurse${h}@example.com`, `Synthetic Nurse ${h}`, 'nurse');
  await HospitalMembership.bulkWrite([admin, doctor, assistant, nurse].map((user, index) => ({ updateOne: { filter: { hospital: hospital._id, user: user._id }, update: { $set: { role: ['hospital_admin', 'doctor', 'assistant_doctor', 'nurse'][index], status: 'active', supervisingDoctor: index === 2 ? doctor._id : null } }, upsert: true } })));
  const patients = [];
  for (let p = 1; p <= patientsPerHospital; p += 1) {
    const patient = await upsertUser(`synthetic.h${h}.patient${p}@example.com`, `Synthetic Patient H${h}-${p}`, 'patient'); patients.push(patient); users.push(patient);
    const relationship = await PatientHospitalRelationship.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: { mrn: `SYNTH-${h}-${String(p).padStart(3, '0')}`, status: 'active', primaryDoctor: doctor._id, assistantDoctors: p % 2 ? [assistant._id] : [], consentStatus: p % 3 ? 'granted' : 'pending' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await HospitalMembership.findOneAndUpdate({ hospital: hospital._id, user: patient._id }, { $set: { role: 'patient', status: 'active', mrn: relationship.mrn } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await MedicalProfile.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: { age: 25 + p, gender: p % 2 ? 'F' : 'M', dialysisType: p % 2 ? 'CAPD' : 'APD', primaryDiagnosis: 'End-stage kidney disease', updatedBy: doctor._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const baseline = await BaselineAssessment.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: { primaryDiagnosis: 'End-stage kidney disease', dialysisType: p % 2 ? 'CAPD' : 'APD', pdPrescription: [{ dwellTiming: 'Day', solutionStrength: '1.5%', fillVolume: 2000, dwellDurationHours: 4, numberOfExchanges: 4, icodextrinUsed: false }], updatedBy: doctor._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await TreatmentPlanVersion.findOneAndUpdate({ patient: patient._id, hospital: hospital._id, version: 1 }, { $set: { plan: baseline.toObject(), updatedBy: doctor._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await PatientConsent.findOneAndUpdate({ patient: patient._id, hospital: hospital._id }, { $set: { scope: p % 3 ? 'detailed' : 'summary', status: 'active', grantedAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const kit = await MaterialSession.findOneAndUpdate({ hospital: hospital._id, patient: patient._id, notes: 'SYNTHETIC_TEST_KIT' }, { $set: { doctor: doctor._id, sessionsCount: 5, pdMaterials: { transferSet: 5, capd: { bags: 20 }, minicap: 5 }, status: 'acknowledged', acknowledgedAt: new Date(), notes: 'SYNTHETIC_TEST_KIT' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    for (let sequence = 1; sequence <= 2; sequence += 1) await DialysisSession.findOneAndUpdate({ materialSession: kit._id, sequence }, { $set: { hospital: hospital._id, patient: patient._id, doctor: doctor._id, status: sequence === 1 ? 'verified' : 'completed', startedAt: new Date(Date.now() - sequence * 86400000), completedAt: new Date(Date.now() - sequence * 86400000 + 3600000), verifiedAt: sequence === 1 ? new Date() : null, verifiedBy: sequence === 1 ? doctor._id : null, verifiedByName: sequence === 1 ? doctor.name : '', voluntary: { wellbeing: sequence === 1 ? 4 : 2, suddenUnwell: p % 5 === 0, comments: p % 5 === 0 ? 'Needs review' : 'Synthetic session' }, readings: { fillVolume: 2000, drainVolume: 2100, fillTime: 10, drainTime: 20 } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await Notification.findOneAndUpdate({ user: admin._id, type: 'synthetic.patient', resourceId: String(patient._id) }, { $set: { hospital: hospital._id, title: `Synthetic patient update ${p}`, message: 'Synthetic PD record requires review.', resourceType: 'Patient', actionUrl: '' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await AuditEvent.findOneAndUpdate({ hospital: hospital._id, action: 'synthetic.patient.created', resourceId: String(patient._id) }, { $set: { actor: doctor._id, resourceType: 'Patient', metadata: { synthetic: true } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  if (h === 1) await BreakGlassAccess.findOneAndUpdate({ hospital: hospital._id, patient: patients[0]._id, actor: doctor._id, reason: 'SYNTHETIC_TEST_BREAK_GLASS' }, { $set: { status: 'active', expiresAt: new Date(Date.now() + 3600000) } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  hospitals.push({ hospital, admin, doctor, assistant, nurse, patients });
}
if (hospitals.length > 1) await PatientTransfer.findOneAndUpdate({ patient: hospitals[0].patients[0]._id, fromHospital: hospitals[0].hospital._id, toHospital: hospitals[1].hospital._id, reason: 'SYNTHETIC_TEST_TRANSFER' }, { $set: { destinationMrn: 'SYNTH-TRANSFER-001', status: 'pending_source', requestedBy: hospitals[0].admin._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
console.log(JSON.stringify({ success: true, hospitals: hospitals.length, patients: hospitals.length * patientsPerHospital, staffPerHospital: 4, password, hospitalCodes: hospitals.map(({ hospital }) => hospital.code) }));
await mongoose.disconnect();
