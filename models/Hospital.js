import mongoose from 'mongoose';

const HospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Hospital = mongoose.model('Hospital', HospitalSchema);
