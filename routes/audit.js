import { Router } from 'express';
import { AuditEvent } from '../models/AuditEvent.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { protect } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';

const router = Router();
router.use(protect);

const GLOBAL_ROLES = new Set(['admin', 'platform_admin']);

async function assertAuditScope(user, hospitalId) {
  if (GLOBAL_ROLES.has(user.role)) return hospitalId || null;
  if (user.role !== 'hospital_admin') throw new HttpError(403, 'Only hospital administrators can review audit events');
  if (!isId(hospitalId)) throw new HttpError(400, 'hospitalId is required');
  const member = await HospitalMembership.exists({ hospital: hospitalId, user: user._id, role: 'hospital_admin', status: 'active' });
  if (!member) throw new HttpError(403, 'You do not administer this hospital');
  return hospitalId;
}

router.get('/', ah(async (req, res) => {
  const { hospitalId, action, resourceType, actor, from, to } = req.query;
  const scopedHospital = await assertAuditScope(req.user, hospitalId);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const filter = {};
  if (scopedHospital) filter.hospital = scopedHospital;
  if (action) filter.action = String(action).slice(0, 120);
  if (resourceType) filter.resourceType = String(resourceType).slice(0, 80);
  if (isId(actor)) filter.actor = actor;
  if (from || to) {
    filter.occurredAt = {};
    if (from && !Number.isNaN(Date.parse(from))) filter.occurredAt.$gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) filter.occurredAt.$lte = new Date(to);
  }
  const [events, total] = await Promise.all([
    AuditEvent.find(filter).populate('actor', 'name email role').populate('hospital', 'name code').sort({ occurredAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditEvent.countDocuments(filter),
  ]);
  res.json({ success: true, events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/:eventId', ah(async (req, res) => {
  if (!isId(req.params.eventId)) throw new HttpError(400, 'Invalid eventId');
  const event = await AuditEvent.findById(req.params.eventId).populate('actor', 'name email role').populate('hospital', 'name code').lean();
  if (!event) throw new HttpError(404, 'Audit event not found');
  await assertAuditScope(req.user, event.hospital?._id ? String(event.hospital._id) : null);
  res.json({ success: true, event });
}));

export default router;
