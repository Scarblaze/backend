import mongoose from 'mongoose';

const HospitalMembershipSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer', 'patient'], required: true },
    status: { type: String, enum: ['invited', 'active', 'suspended'], default: 'active', index: true },
    mrn: { type: String, default: '' },
    supervisingDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

HospitalMembershipSchema.index({ hospital: 1, user: 1 }, { unique: true });
HospitalMembershipSchema.index({ hospital: 1, mrn: 1 }, { unique: true, partialFilterExpression: { mrn: { $type: 'string', $ne: '' } } });

export const HospitalMembership = mongoose.model('HospitalMembership', HospitalMembershipSchema);
