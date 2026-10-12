import mongoose from 'mongoose';

const HospitalInvitationSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer', 'patient'], required: true },
    mrn: { type: String, default: '' },
    supervisingDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const HospitalInvitation = mongoose.model('HospitalInvitation', HospitalInvitationSchema);
