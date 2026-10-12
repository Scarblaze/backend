import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['platform_admin', 'hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer', 'patient', 'admin'],
      default: 'patient',
      index: true,
    },
    // Patients point at the doctor who registered them.
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    supervisingDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);

UserSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 10);
UserSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model('User', UserSchema);
