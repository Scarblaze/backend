import { Router } from 'express';
import mongoose from 'mongoose';
import { PatientTransfer } from '../models/PatientTransfer.js';
import { PatientHospitalRelationship } from '../models/PatientHospitalRelationship.js';
import { Hospital } from '../models/Hospital.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { User } from '../models/User.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { protect } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';
import { notifyHospitalAdmins } from '../services/notifications.js';

const router = Router();
router.use(protect);
const ADMIN_ROLES = ['hospital_admin'];
const global = (role) => ['admin', 'platform_admin'].includes(role);

async function assertAdmin(user, hospitalId) {
  if (global(user.role)) return;
  const member = await HospitalMembership.exists({ hospital: hospitalId, user: user._id, role: { $in: ADMIN_ROLES }, status: 'active' });
  if (!member) throw new HttpError(403, 'Only a hospital administrator can approve transfers');
}

router.post('/', ah(async (req, res) => {
  const { patientId, fromHospitalId, toHospitalId, destinationMrn, reason } = req.body || {};
  if (![patientId, fromHospitalId, toHospitalId].every(isId) || typeof destinationMrn !== 'string' || !destinationMrn.trim() || typeof reason !== 'string' || reason.trim().length < 10) {
    throw new HttpError(400, 'Patient, both hospitals, destination MRN, and a reason of at least 10 characters are required');
  }
  if (String(fromHospitalId) === String(toHospitalId)) throw new HttpError(400, 'Source and destination hospitals must differ');
  await assertAdmin(req.user, fromHospitalId);
  const [patient, source, destination] = await Promise.all([
    User.findOne({ _id: patientId, role: 'patient' }).select('_id'),
    Hospital.findById(fromHospitalId).select('_id'),
    Hospital.findById(toHospitalId).select('_id'),
  ]);
  if (!patient || !source || !destination) throw new HttpError(404, 'Patient or hospital not found');
  const relationship = await PatientHospitalRelationship.exists({ patient: patientId, hospital: fromHospitalId, status: 'active' });
  if (!relationship) throw new HttpError(404, 'Patient is not active at the source hospital');
  const transfer = await PatientTransfer.create({ patient: patientId, fromHospital: fromHospitalId, toHospital: toHospitalId, destinationMrn: destinationMrn.trim(), reason: reason.trim(), requestedBy: req.user._id });
  await AuditEvent.create({ actor: req.user._id, hospital: fromHospitalId, action: 'patient.transfer.requested', resourceType: 'PatientTransfer', resourceId: String(transfer._id), metadata: { patientId: String(patientId), toHospitalId: String(toHospitalId) } });
  await notifyHospitalAdmins({ hospital: toHospitalId, type: 'transfer.requested', title: 'Incoming patient transfer', message: 'A patient transfer is awaiting destination review.', resourceType: 'PatientTransfer', resourceId: String(transfer._id) });
  res.status(201).json({ success: true, transfer });
}));

router.get('/', ah(async (req, res) => {
  const hospitalId = req.query.hospitalId;
  if (!isId(hospitalId)) throw new HttpError(400, 'A valid hospitalId is required');
  await assertAdmin(req.user, hospitalId);
  const transfers = await PatientTransfer.find({ $or: [{ fromHospital: hospitalId }, { toHospital: hospitalId }] }).populate('patient', 'name email').populate('fromHospital', 'name code').populate('toHospital', 'name code').populate('requestedBy', 'name email').sort({ createdAt: -1 }).lean();
  res.json({ success: true, transfers });
}));

router.patch('/:transferId/source-approve', ah(async (req, res) => {
  if (!isId(req.params.transferId)) throw new HttpError(400, 'Invalid transferId');
  const transfer = await PatientTransfer.findById(req.params.transferId);
  if (!transfer) throw new HttpError(404, 'Transfer not found');
  await assertAdmin(req.user, transfer.fromHospital);
  if (transfer.status !== 'pending_source') throw new HttpError(409, 'Transfer is not awaiting source approval');
  transfer.status = 'pending_destination'; transfer.sourceApprovedBy = req.user._id; transfer.sourceApprovedAt = new Date(); await transfer.save();
  await AuditEvent.create({ actor: req.user._id, hospital: transfer.fromHospital, action: 'patient.transfer.source_approved', resourceType: 'PatientTransfer', resourceId: String(transfer._id) });
  res.json({ success: true, transfer });
}));

router.patch('/:transferId/destination-approve', ah(async (req, res) => {
  if (!isId(req.params.transferId)) throw new HttpError(400, 'Invalid transferId');
  const transfer = await PatientTransfer.findById(req.params.transferId);
  if (!transfer) throw new HttpError(404, 'Transfer not found');
  await assertAdmin(req.user, transfer.toHospital);
  if (transfer.status !== 'pending_destination') throw new HttpError(409, 'Transfer is not awaiting destination approval');
  if (String(transfer.sourceApprovedBy) === String(req.user._id)) throw new HttpError(409, 'A second hospital administrator must approve this transfer');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await PatientHospitalRelationship.exists({ patient: transfer.patient, hospital: transfer.toHospital, status: 'active' }).session(session);
      if (existing) throw new HttpError(409, 'Patient is already active at the destination hospital');
      const sourceRelationship = await PatientHospitalRelationship.findOne({ patient: transfer.patient, hospital: transfer.fromHospital, status: 'active' }).session(session);
      if (!sourceRelationship) throw new HttpError(409, 'Source patient relationship is no longer active');
      sourceRelationship.status = 'transferred'; sourceRelationship.endedAt = new Date(); await sourceRelationship.save({ session });
      await PatientHospitalRelationship.create([{ patient: transfer.patient, hospital: transfer.toHospital, mrn: transfer.destinationMrn, primaryDoctor: null }], { session });
      transfer.status = 'completed'; transfer.destinationApprovedBy = req.user._id; transfer.destinationApprovedAt = new Date(); transfer.completedAt = new Date(); await transfer.save({ session });
      await AuditEvent.create([{ actor: req.user._id, hospital: transfer.toHospital, action: 'patient.transfer.completed', resourceType: 'PatientTransfer', resourceId: String(transfer._id), metadata: { patientId: String(transfer.patient), fromHospitalId: String(transfer.fromHospital) } }], { session });
    });
  } finally { await session.endSession(); }
  res.json({ success: true, transfer });
}));

export default router;
