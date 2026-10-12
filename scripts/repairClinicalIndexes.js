import 'dotenv/config';
import connectDB from '../config/db.js';
import { MedicalProfile } from '../models/MedicalProfile.js';
import { BaselineAssessment } from '../models/BaselineAssessment.js';

await connectDB();
for (const Model of [MedicalProfile, BaselineAssessment]) {
  try { await Model.collection.dropIndex('patient_1'); } catch (error) { if (error.codeName !== 'IndexNotFound') throw error; }
  await Model.syncIndexes();
}
console.log('Obsolete patient-only clinical indexes removed; hospital-scoped indexes synchronized.');
process.exit(0);
