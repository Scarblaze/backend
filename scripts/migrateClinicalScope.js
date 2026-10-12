import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { MedicalProfile } from '../models/MedicalProfile.js';
import { BaselineAssessment } from '../models/BaselineAssessment.js';
import { TreatmentPlanVersion } from '../models/TreatmentPlanVersion.js';

const hospitalId = process.env.CLINICAL_MIGRATION_HOSPITAL_ID;
if (!hospitalId || !mongoose.isValidObjectId(hospitalId)) throw new Error('Set CLINICAL_MIGRATION_HOSPITAL_ID to the hospital receiving legacy unscoped clinical records');

await connectDB();
const scope = new mongoose.Types.ObjectId(hospitalId);
const [profiles, assessments, versions] = await Promise.all([
  MedicalProfile.updateMany({ hospital: null }, { $set: { hospital: scope } }),
  BaselineAssessment.updateMany({ hospital: null }, { $set: { hospital: scope } }),
  TreatmentPlanVersion.updateMany({ hospital: null }, { $set: { hospital: scope } }),
]);
await Promise.all([MedicalProfile.syncIndexes(), BaselineAssessment.syncIndexes(), TreatmentPlanVersion.syncIndexes()]);
console.log(JSON.stringify({ hospitalId, medicalProfiles: profiles.modifiedCount, baselineAssessments: assessments.modifiedCount, treatmentPlanVersions: versions.modifiedCount }));
await mongoose.disconnect();
