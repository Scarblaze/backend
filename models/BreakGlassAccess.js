import mongoose from 'mongoose';

const BreakGlassAccessSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },
    status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active', index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

BreakGlassAccessSchema.index({ actor: 1, patient: 1, hospital: 1, status: 1 });

export const BreakGlassAccess = mongoose.model('BreakGlassAccess', BreakGlassAccessSchema);
