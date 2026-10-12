import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const MedicalProfileSchema = new mongoose.Schema(
  {
    patient: { type: ObjectId, ref: 'User', required: true, index: true },
    hospital: { type: ObjectId, ref: 'Hospital', default: null, index: true },
    age: { type: Number, default: 0 },
    dateOfBirth: { type: String, default: '' },
    gender: { type: String, default: '' },
    crNumber: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    educationLevel: { type: String, default: '' },
    incomeLevel: { type: String, default: '' },
    primaryDiagnosis: { type: String, default: '' },
    nativeKidneyDisease: { type: String, default: '' },
    dialysisType: { type: String, default: '' },
    bloodGroup: { type: String, default: '' },
    height: { type: String, default: '' },
    weight: { type: String, default: '' },
    allergies: { type: [String], default: [] },
    comorbidities: { type: [String], default: [] },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relation: { type: String, default: '' },
    },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false }
);

MedicalProfileSchema.index({ patient: 1, hospital: 1 }, { unique: true });

export const MedicalProfile = mongoose.model('MedicalProfile', MedicalProfileSchema);
