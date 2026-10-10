import { User } from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import { isId } from '../utils/clean.js';

export function assertCanAccess(user, patient) {
  const uid = String(user._id);
  if (user.role === 'admin') return;
  if (user.role === 'patient' && uid === String(patient._id)) return;
  if (user.role === 'doctor' && String(patient.assignedDoctor) === uid) return;
  throw new HttpError(403, 'You do not have access to this patient');
}

export async function getPatientFor(user, patientId) {
  if (!isId(patientId)) throw new HttpError(400, 'A valid patientId is required');
  const patient = await User.findOne({ _id: patientId, role: 'patient' });
  if (!patient) throw new HttpError(404, 'Patient not found');
  assertCanAccess(user, patient);
  return patient;
}

// Patients always act on themselves; doctors/admins must name the patient.
export function resolvePatientId(req) {
  const requested = req.body?.patientId;
  if (req.user.role === 'patient') {
    if (requested && String(requested) !== String(req.user._id)) {
      throw new HttpError(403, 'You can only view your own records');
    }
    return String(req.user._id);
  }
  return requested;
}
