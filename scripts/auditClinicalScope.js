import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { MedicalProfile } from '../models/MedicalProfile.js';
import { BaselineAssessment } from '../models/BaselineAssessment.js';
import { TreatmentPlanVersion } from '../models/TreatmentPlanVersion.js';

await connectDB();
const counts = {
  medicalProfilesUnscoped: await MedicalProfile.countDocuments({ hospital: null }),
  baselineAssessmentsUnscoped: await BaselineAssessment.countDocuments({ hospital: null }),
  treatmentPlanVersionsUnscoped: await TreatmentPlanVersion.countDocuments({ hospital: null }),
};
console.log(JSON.stringify(counts));
await mongoose.disconnect();
if (Object.values(counts).some((count) => count > 0)) process.exitCode = 1;
