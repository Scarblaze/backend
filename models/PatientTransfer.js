import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const PatientTransferSchema = new mongoose.Schema(
  {
    patient: { type: ObjectId, ref: 'User', required: true, index: true },
    fromHospital: { type: ObjectId, ref: 'Hospital', required: true, index: true },
    toHospital: { type: ObjectId, ref: 'Hospital', required: true, index: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    destinationMrn: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending_source', 'pending_destination', 'completed', 'rejected'], default: 'pending_source', index: true },
    requestedBy: { type: ObjectId, ref: 'User', required: true },
    sourceApprovedBy: { type: ObjectId, ref: 'User', default: null },
    sourceApprovedAt: { type: Date, default: null },
    destinationApprovedBy: { type: ObjectId, ref: 'User', default: null },
    destinationApprovedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const PatientTransfer = mongoose.model('PatientTransfer', PatientTransferSchema);
