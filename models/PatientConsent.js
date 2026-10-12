import mongoose from 'mongoose';

const PatientConsentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    scope: { type: String, enum: ['summary', 'detailed'], required: true },
    status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active', index: true },
    grantedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null, index: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PatientConsentSchema.index({ patient: 1, hospital: 1 }, { unique: true });

export const PatientConsent = mongoose.model('PatientConsent', PatientConsentSchema);
