import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// A "kit" of PD supplies a doctor issues to a patient, good for `sessionsCount` dialysis sessions.
const MaterialSessionSchema = new mongoose.Schema(
  {
    patient: { type: ObjectId, ref: 'User', required: true, index: true },
    doctor: { type: ObjectId, ref: 'User', required: true },
    sessionsCount: { type: Number, required: true, min: 1 },
    pdMaterials: {
      transferSet: { type: Number, default: 0 },
      capd: { type: Mixed, default: {} },
      apd: { type: Mixed, default: {} },
      icodextrin2L: { type: Number, default: 0 },
      minicap: { type: Number, default: 0 },
      others: { type: Mixed, default: null },
    },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['active', 'acknowledged'], default: 'active' },
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

export const MaterialSession = mongoose.model('MaterialSession', MaterialSessionSchema);
