import { Router } from 'express';
import { BreakGlassAccess } from '../models/BreakGlassAccess.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { PatientHospitalRelationship } from '../models/PatientHospitalRelationship.js';
import { User } from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';
import { recordAudit } from '../services/audit.js';

const router = Router();
router.use(protect);

const CLINICAL_ROLES = ['hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer'];

async function requireHospitalClinician(user, hospitalId) {
  if (!isId(hospitalId)) throw new HttpError(400, 'A valid hospitalId is required');
  if (['admin', 'platform_admin'].includes(user.role)) return;
  const membership = await HospitalMembership.exists({ hospital: hospitalId, user: user._id, role: { $in: CLINICAL_ROLES }, status: 'active' });
  if (!membership) throw new HttpError(403, 'You are not an active clinician in this hospital');
}

router.post('/', ah(async (req, res) => {
  const { hospitalId, patientId, reason, durationMinutes = 60 } = req.body || {};
  await requireHospitalClinician(req.user, hospitalId);
  if (!isId(patientId) || typeof reason !== 'string' || reason.trim().length < 10) throw new HttpError(400, 'patientId and a reason of at least 10 characters are required');
  const patient = await User.findOne({ _id: patientId, role: 'patient' }).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');
  const relationship = await PatientHospitalRelationship.exists({ patient: patientId, hospital: hospitalId, status: 'active' });
  if (!relationship) throw new HttpError(404, 'Patient is not active at this hospital');
  const minutes = Number(durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) throw new HttpError(400, 'durationMinutes must be between 5 and 240');

  await BreakGlassAccess.updateMany({ actor: req.user._id, patient: patientId, hospital: hospitalId, status: 'active', expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
  const access = await BreakGlassAccess.create({ actor: req.user._id, patient: patientId, hospital: hospitalId, reason: reason.trim(), expiresAt: new Date(Date.now() + minutes * 60 * 1000) });
  await recordAudit({ actor: req.user._id, hospital: hospitalId, action: 'security.break_glass.granted', resourceType: 'BreakGlassAccess', resourceId: access._id, reason: reason.trim(), metadata: { patientId: String(patientId), durationMinutes: minutes } });
  res.status(201).json({ success: true, access: { id: String(access._id), patientId: String(patientId), hospitalId: String(hospitalId), expiresAt: access.expiresAt, status: access.status } });
}));

router.get('/active', ah(async (req, res) => {
  const accesses = await BreakGlassAccess.find({ actor: req.user._id, status: 'active', expiresAt: { $gt: new Date() } }).populate('patient', 'name email').populate('hospital', 'name code').sort({ expiresAt: 1 }).lean();
  res.json({ success: true, accesses });
}));

router.get('/hospital', ah(async (req, res) => {
  const { hospitalId } = req.query;
  if (!isId(hospitalId)) throw new HttpError(400, 'A valid hospitalId is required');
  const admin = ['admin', 'platform_admin'].includes(req.user.role) || await HospitalMembership.exists({ hospital: hospitalId, user: req.user._id, role: 'hospital_admin', status: 'active' });
  if (!admin) throw new HttpError(403, 'Only hospital administrators can review break-glass access');
  const accesses = await BreakGlassAccess.find({ hospital: hospitalId }).populate('actor', 'name email role').populate('patient', 'name email').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, accesses });
}));

router.post('/:accessId/revoke', ah(async (req, res) => {
  if (!isId(req.params.accessId)) throw new HttpError(400, 'Invalid accessId');
  const access = await BreakGlassAccess.findOne({ _id: req.params.accessId, actor: req.user._id, status: 'active' });
  if (!access) throw new HttpError(404, 'Active break-glass access not found');
  access.status = 'revoked';
  access.revokedAt = new Date();
  access.revokedBy = req.user._id;
  await access.save();
  await recordAudit({ actor: req.user._id, hospital: access.hospital, action: 'security.break_glass.revoked', resourceType: 'BreakGlassAccess', resourceId: access._id, metadata: { patientId: String(access.patient) } });
  res.json({ success: true, status: access.status, revokedAt: access.revokedAt });
}));

export default router;
