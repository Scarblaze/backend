import { AuditEvent } from '../models/AuditEvent.js';

export async function recordAudit({ actor, action, resourceType, resourceId = '', hospital = null, reason = '', metadata = {} }) {
  return AuditEvent.create({ actor, action, resourceType, resourceId: String(resourceId || ''), hospital: hospital || null, reason: String(reason || ''), metadata });
}
