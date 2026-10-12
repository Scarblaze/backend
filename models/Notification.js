import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  resourceType: { type: String, default: '' },
  resourceId: { type: String, default: '' },
    actionUrl: { type: String, default: '' },
  readAt: { type: Date, default: null },
}, { timestamps: true });

NotificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
export const Notification = mongoose.model('Notification', NotificationSchema);
