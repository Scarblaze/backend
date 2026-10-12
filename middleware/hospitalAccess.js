import { HospitalMembership } from '../models/HospitalMembership.js';
import { Hospital } from '../models/Hospital.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';

const GLOBAL_ROLES = new Set(['admin', 'platform_admin']);

export const requireHospitalAccess = (...roles) => ah(async (req, _res, next) => {
  const hospitalId = req.params.hospitalId || req.body?.hospitalId;
  if (!isId(hospitalId)) throw new HttpError(400, 'A valid hospitalId is required');
  if (GLOBAL_ROLES.has(req.user.role)) {
    req.hospitalAccess = { hospitalId: String(hospitalId), global: true };
    return next();
  }
  const hospital = await Hospital.findById(hospitalId).select('status').lean();
  if (!hospital) throw new HttpError(404, 'Hospital not found');
  if (hospital.status !== 'active') throw new HttpError(403, 'This hospital is currently suspended');
  const membership = await HospitalMembership.findOne({ hospital: hospitalId, user: req.user._id, status: 'active' }).lean();
  if (!membership) throw new HttpError(403, 'You do not belong to this hospital');
  if (roles.length && !roles.includes(membership.role)) throw new HttpError(403, 'Permission denied for this hospital role');
  req.hospitalAccess = { hospitalId: String(hospitalId), membership, global: false };
  next();
});

export const requirePatientAccess = ah(async (req, _res, next) => {
  const patientId = req.params.patientId || req.body?.patientId;
  if (!isId(patientId)) throw new HttpError(400, 'A valid patientId is required');
  if (GLOBAL_ROLES.has(req.user.role) || String(req.user._id) === String(patientId)) return next();
  if (['doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer', 'hospital_admin'].includes(req.user.role)) return next();
  throw new HttpError(403, 'Permission denied for this patient');
});
