import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Photos attached to a material kit (doctor) or a dialysis session (patient).
const ImageAssetSchema = new mongoose.Schema({
  ownerType: { type: String, enum: ['material', 'dialysis'], required: true },
  ownerId: { type: ObjectId, required: true, index: true },
  patient: { type: ObjectId, ref: 'User', required: true },
  uploadedBy: { type: ObjectId, ref: 'User', required: true },
  storage: { type: String, enum: ['cloudinary', 'db'], required: true },
  url: { type: String, default: '' }, // cloudinary only
  publicId: { type: String, default: '' },
  token: { type: String, unique: true, sparse: true }, // db storage: unguessable URL key
  contentType: { type: String, default: 'image/jpeg' },
  data: { type: Buffer, select: false }, // db storage only
  uploadedAt: { type: Date, default: Date.now },
});

export const ImageAsset = mongoose.model('ImageAsset', ImageAssetSchema);
