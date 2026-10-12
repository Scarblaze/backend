import { Router } from 'express';
import { User } from '../models/User.js';
import { MedicalProfile } from '../models/MedicalProfile.js';
import { BaselineAssessment } from '../models/BaselineAssessment.js';
import { MaterialSession } from '../models/MaterialSession.js';
import { DialysisSession } from '../models/DialysisSession.js';
import { PatientConsent } from '../models/PatientConsent.js';
import { PatientHospitalRelationship } from '../models/PatientHospitalRelationship.js';
import { TreatmentPlanVersion } from '../models/TreatmentPlanVersion.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { protect } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';
import { recordAudit } from '../services/audit.js';

const router = Router();
router.use(protect);

const GLOBAL_ROLES = ['admin', 'platform_admin'];
const STAFF_ROLES = ['hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer'];

router.get('/:patientId/history', ah(async (req, res) => {
  const { patientId } = req.params;
  const { hospitalId } = req.query;
  if (!isId(patientId) || !isId(hospitalId)) throw new HttpError(400, 'Valid patientId and hospitalId are required');
  const patient = await User.findOne({ _id: patientId, role: 'patient' }).select('name email phone').lean();
  if (!patient) throw new HttpError(404, 'Patient not found');

  const isSelf = String(req.user._id) === patientId;
  let scope = 'summary';
  if (isSelf || GLOBAL_ROLES.includes(req.user.role)) {
    scope = 'detailed';
  } else {
    if (!STAFF_ROLES.includes(req.user.role)) throw new HttpError(403, 'Permission denied');
    const membership = await HospitalMembership.exists({ hospital: hospitalId, user: req.user._id, status: 'active' });
    if (!membership) throw new HttpError(403, 'You do not belong to this hospital');
    const relationship = await PatientHospitalRelationship.exists({ patient: patientId, hospital: hospitalId, status: 'active' });
    if (!relationship) throw new HttpError(403, 'Patient is not active at this hospital');
    const consent = await PatientConsent.findOne({ patient: patientId, hospital: hospitalId, status: 'active', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).lean();
    if (req.user.role === 'hospital_admin' || consent?.scope === 'detailed') scope = 'detailed';
  }

  const [relationship, profile, baseline, kits, sessions, planVersions, activity] = await Promise.all([
    PatientHospitalRelationship.findOne({ patient: patientId, hospital: hospitalId }).populate('hospital', 'name code').populate('primaryDoctor', 'name email').populate('assistantDoctors', 'name email').populate('careTeam', 'name email role').lean(),
    MedicalProfile.findOne({ patient: patientId, hospital: hospitalId }).lean(),
    BaselineAssessment.find({ patient: patientId, hospital: hospitalId }).sort({ createdAt: -1 }).lean(),
    MaterialSession.find({ patient: patientId, hospital: hospitalId }).select('status sessionsCount acknowledgedAt createdAt updatedAt').sort({ createdAt: -1 }).lean(),
    DialysisSession.find({ patient: patientId, hospital: hospitalId }).select('status sequence startedAt completedAt verifiedAt doctor verifiedByName voluntary readings').sort({ startedAt: -1 }).lean(),
    TreatmentPlanVersion.find({ patient: patientId, hospital: hospitalId }).select('version plan createdAt updatedBy').sort({ version: -1 }).lean(),
    AuditEvent.find({ hospital: hospitalId, $or: [{ resourceId: patientId }, { 'metadata.patientId': patientId }] }).populate('actor', 'name email role').sort({ occurredAt: -1 }).limit(30).lean(),
  ]);

  const result = {
    success: true,
    scope,
    patient: { id: patientId, name: patient.name, email: patient.email, phone: patient.phone },
    relationship,
    profile: scope === 'detailed' ? profile : profile ? { primaryDiagnosis: profile.primaryDiagnosis, dialysisType: profile.dialysisType, allergies: profile.allergies, comorbidities: profile.comorbidities } : null,
    baselineAssessments: scope === 'detailed' ? baseline.map((item, index) => index === 0 ? { ...item, planVersions } : item) : baseline.map((item) => ({ primaryDiagnosis: item.primaryDiagnosis, dialysisType: item.dialysisType, createdAt: item.createdAt })),
    materialSessions: kits,
    dialysisSessions: scope === 'detailed' ? sessions : sessions.map((item) => ({ status: item.status, sequence: item.sequence, startedAt: item.startedAt, completedAt: item.completedAt, verifiedAt: item.verifiedAt })),
    treatmentPlanVersions: scope === 'detailed' ? planVersions : [],
    activity: scope === 'detailed' ? activity : activity.slice(0, 5),
  };
  await recordAudit({ actor: req.user._id, hospital: hospitalId, action: 'clinical.patient_history.viewed', resourceType: 'Patient', resourceId: patientId, metadata: { patientId, scope } });
  res.json(result);
}));

export default router;
