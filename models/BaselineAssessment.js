import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const sub = { _id: false };

// Dates are kept as "YYYY-MM-DD" strings because the app reads them as String?.
const LabValue = new mongoose.Schema({ value: { type: Number, default: 0 }, date: { type: String, default: null } }, sub);

const BaselineAssessmentSchema = new mongoose.Schema(
  {
    patient: { type: ObjectId, ref: 'User', required: true, index: true },
    hospital: { type: ObjectId, ref: 'Hospital', default: null, index: true },
    primaryDiagnosis: { type: String, default: '' },
    nativeKidneyDisease: { type: String, default: '' },
    dialysisType: { type: String, default: '' },
    pdCatheterInsertionDate: { type: String, default: null },
    catheterTechnique: { type: String, default: '' },
    pdStartDate: { type: String, default: null },
    trainingStartDate: { type: String, default: null },
    trainingCompletionDate: { type: String, default: null },
    periImplantComplications: new mongoose.Schema(
      { present: { type: Boolean, default: false }, details: { type: String, default: '' } },
      sub
    ),
    clinicalExam: new mongoose.Schema(
      {
        pulse: Number,
        bpSystolic: Number,
        bpDiastolic: Number,
        weightKg: Number,
        heightCm: Number,
        pallor: Boolean,
        icterus: Boolean,
        cyanosis: Boolean,
        clubbing: Boolean,
        edema: Boolean,
      },
      sub
    ),
    pdPrescription: [
      new mongoose.Schema(
        {
          dwellTiming: String,
          solutionStrength: String,
          fillVolume: Number,
          dwellDurationHours: Number,
          numberOfExchanges: Number,
          icodextrinUsed: Boolean,
        },
        sub
      ),
    ],
    labs: new mongoose.Schema({ hemoglobin: LabValue, urea: LabValue, creatinine: LabValue }, sub),
    planAndAdvice: new mongoose.Schema(
      { advisedPrescription: String, medications: String, followUpInstructions: String },
      sub
    ),
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false }
);

BaselineAssessmentSchema.index({ patient: 1, hospital: 1 }, { unique: true });

export const BaselineAssessment = mongoose.model('BaselineAssessment', BaselineAssessmentSchema);
