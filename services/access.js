import { User } from '../models/User.js';
import { PatientHospitalRelationship } from '../models/PatientHospitalRelationship.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { BreakGlassAccess } from '../models/BreakGlassAccess.js';
import { HttpError } from '../utils/errors.js';
import { isId } from '../utils/clean.js';

export function assertCanAccess(user, patient) {
  const uid = String(user._id);
  if (user.role === 'admin' || user.role === 'platform_admin') return;
  if (user.role === 'patient' && uid === String(patient._id)) return;
  if (user.role === 'doctor' && String(patient.assignedDoctor) === uid) return;
  throw new HttpError(403, 'You do not have access to this patient');
}

export async function canAccessPatient(user, patient, hospitalId = null) {
  if (hospitalId && !['admin', 'platform_admin', 'patient'].includes(user.role)) {
    if (['hospital_admin', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer'].includes(user.role)) {
      const [membership, relationship] = await Promise.all([
        HospitalMembership.exists({ hospital: hospitalId, user: user._id, status: 'active' }),
        PatientHospitalRelationship.exists({ patient: patient._id, hospital: hospitalId, status: 'active' }),
      ]);
      if (membership && relationship) return true;
    }
    const clinicalRelationship = await PatientHospitalRelationship.exists({
      patient: patient._id,
      hospital: hospitalId,
      status: 'active',
      ...(user.role === 'assistant_doctor' ? { assistantDoctors: user._id } : { primaryDoctor: user._id }),
    });
    if (clinicalRelationship) return true;
    const emergency = await BreakGlassAccess.exists({ actor: user._id, patient: patient._id, hospital: hospitalId, status: 'active', expiresAt: { $gt: new Date() } });
    if (emergency) return true;
    throw new HttpError(403, 'You do not have access to this patient at this hospital');
  }
  try {
    assertCanAccess(user, patient);
    return true;
  } catch (err) {
    if (user.role !== 'assistant_doctor' && !hospitalId) throw err;
    const relationship = await PatientHospitalRelationship.exists({
      patient: patient._id,
      status: 'active',
      ...(hospitalId ? { hospital: hospitalId } : {}),
      ...(user.role === 'assistant_doctor' ? { assistantDoctors: user._id } : {}),
    });
    if (!relationship) {
      const emergency = hospitalId && await BreakGlassAccess.exists({ actor: user._id, patient: patient._id, hospital: hospitalId, status: 'active', expiresAt: { $gt: new Date() } });
      if (!emergency) throw err;
    }
    return true;
  }
}

export async function getPatientFor(user, patientId, hospitalId = null) {
  if (!isId(patientId)) throw new HttpError(400, 'A valid patientId is required');
  const patient = await User.findOne({ _id: patientId, role: 'patient' });
  if (!patient) throw new HttpError(404, 'Patient not found');
  await canAccessPatient(user, patient, hospitalId);
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
