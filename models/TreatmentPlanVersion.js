import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const TreatmentPlanVersionSchema = new mongoose.Schema(
  {
    patient: { type: ObjectId, ref: 'User', required: true, index: true },
    hospital: { type: ObjectId, ref: 'Hospital', default: null, index: true },
    version: { type: Number, required: true },
    plan: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

TreatmentPlanVersionSchema.index({ patient: 1, hospital: 1, version: 1 }, { unique: true });

export const TreatmentPlanVersion = mongoose.model('TreatmentPlanVersion', TreatmentPlanVersionSchema);
