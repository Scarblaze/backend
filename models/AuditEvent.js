import mongoose from 'mongoose';

const AuditEventSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null, index: true },
    action: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true },
    resourceId: { type: String, default: '' },
    reason: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

export const AuditEvent = mongoose.model('AuditEvent', AuditEventSchema);
