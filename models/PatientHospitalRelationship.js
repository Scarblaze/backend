import mongoose from 'mongoose';

const PatientHospitalRelationshipSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    mrn: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'transferred', 'discharged', 'suspended'], default: 'active', index: true },
    primaryDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assistantDoctors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    careTeam: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    consentStatus: { type: String, enum: ['pending', 'granted', 'withdrawn'], default: 'pending' },
    joinedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PatientHospitalRelationshipSchema.index({ patient: 1, hospital: 1 }, { unique: true });
PatientHospitalRelationshipSchema.index({ hospital: 1, mrn: 1 }, { unique: true });

export const PatientHospitalRelationship = mongoose.model('PatientHospitalRelationship', PatientHospitalRelationshipSchema);
