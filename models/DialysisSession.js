import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const B = Boolean;

// Field names mirror VoluntaryParameters in the Flutter app. Unknown keys are dropped (strict mode).
const VoluntarySchema = new mongoose.Schema(
  {
    wellbeing: Number,
    appetite: B, nausea: B, vomiting: B, abdominalDiscomfort: B, constipation: B, diarrhea: B,
    sleepQuality: Number,
    fatigue: B, ableToDoActivities: B,
    breathlessness: B, footSwelling: B, facialPuffiness: B, rapidWeightGain: B,
    bpMeasured: B, sbp: Number, dbp: Number,
    weightMeasured: B, weightKg: Number,
    painDuringFillDrain: B, slowDrain: B, catheterLeak: B, exitSiteIssue: B,
    effluentClarity: String,
    urinePassed: B, urineAmount: String, fluidOverloadFeeling: B,
    fever: B, chills: B, newAbdominalPain: B, suddenUnwell: B,
    comments: String,
  },
  { _id: false }
);

const ReadingsSchema = new mongoose.Schema(
  { fillVolume: Number, drainVolume: Number, fillTime: Number, drainTime: Number },
  { _id: false }
);

// One dialysis day. Lifecycle: active (started) -> completed (patient finished) -> verified (doctor).
const DialysisSessionSchema = new mongoose.Schema(
  {
    hospital: { type: ObjectId, ref: 'Hospital', default: null, index: true },
    materialSession: { type: ObjectId, ref: 'MaterialSession', required: true, index: true },
    patient: { type: ObjectId, ref: 'User', required: true, index: true },
    doctor: { type: ObjectId, ref: 'User', required: true },
    sequence: { type: Number, required: true },
    status: { type: String, enum: ['active', 'completed', 'verified', 'cancelled'], default: 'active' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    voluntary: { type: VoluntarySchema, default: null },
    readings: { type: ReadingsSchema, default: null },
    verifiedAt: { type: Date, default: null },
    verificationNotes: { type: String, default: '' },
    verifiedBy: { type: ObjectId, ref: 'User', default: null },
    verifiedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

// Guards against double-tap creating two "day N" sessions.
DialysisSessionSchema.index({ materialSession: 1, sequence: 1 }, { unique: true });

export const DialysisSession = mongoose.model('DialysisSession', DialysisSessionSchema);
