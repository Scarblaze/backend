import { Router } from 'express';
import { PatientConsent } from '../models/PatientConsent.js';
import { PatientHospitalRelationship } from '../models/PatientHospitalRelationship.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { protect } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';
import { recordAudit } from '../services/audit.js';

const router = Router();
router.use(protect);

async function assertPatientOrHospitalAdmin(user, patientId, hospitalId) {
  if (!isId(patientId) || !isId(hospitalId)) throw new HttpError(400, 'Valid patientId and hospitalId are required');
  if (['admin', 'platform_admin'].includes(user.role) || String(user._id) === String(patientId)) return;
  const member = await HospitalMembership.exists({ hospital: hospitalId, user: user._id, role: 'hospital_admin', status: 'active' });
  if (!member) throw new HttpError(403, 'Only the patient or hospital administrator can manage consent');
}

router.post('/', ah(async (req, res) => {
  const { patientId = req.user._id, hospitalId, scope, expiresAt = null } = req.body || {};
  await assertPatientOrHospitalAdmin(req.user, patientId, hospitalId);
  if (!['summary', 'detailed'].includes(scope)) throw new HttpError(400, 'scope must be summary or detailed');
  const relationship = await PatientHospitalRelationship.exists({ patient: patientId, hospital: hospitalId, status: 'active' });
  if (!relationship) throw new HttpError(404, 'Patient is not active at this hospital');
  const expiry = expiresAt ? new Date(expiresAt) : null;
  if (expiresAt && Number.isNaN(expiry.getTime())) throw new HttpError(400, 'expiresAt must be a valid date');
  const consent = await PatientConsent.findOneAndUpdate(
    { patient: patientId, hospital: hospitalId },
    { $set: { scope, status: 'active', expiresAt: expiry, grantedAt: new Date(), revokedAt: null } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await recordAudit({ actor: req.user._id, hospital: hospitalId, action: 'consent.granted', resourceType: 'PatientConsent', resourceId: consent._id, metadata: { patientId: String(patientId), scope } });
  res.status(201).json({ success: true, consent });
}));

router.post('/revoke', ah(async (req, res) => {
  const { patientId = req.user._id, hospitalId } = req.body || {};
  await assertPatientOrHospitalAdmin(req.user, patientId, hospitalId);
  const consent = await PatientConsent.findOneAndUpdate({ patient: patientId, hospital: hospitalId, status: 'active' }, { $set: { status: 'revoked', revokedAt: new Date() } }, { new: true });
  if (!consent) throw new HttpError(404, 'Active consent not found');
  await recordAudit({ actor: req.user._id, hospital: hospitalId, action: 'consent.revoked', resourceType: 'PatientConsent', resourceId: consent._id, metadata: { patientId: String(patientId) } });
  res.json({ success: true, consent });
}));

router.get('/patient/:patientId', ah(async (req, res) => {
  if (!isId(req.params.patientId)) throw new HttpError(400, 'Invalid patientId');
  const { hospitalId } = req.query;
  if (String(req.user._id) !== req.params.patientId && !['admin', 'platform_admin', 'hospital_admin'].includes(req.user.role)) throw new HttpError(403, 'Permission denied');
  const filter = { patient: req.params.patientId };
  if (hospitalId) {
    if (!isId(hospitalId)) throw new HttpError(400, 'Invalid hospitalId');
    if (req.user.role === 'hospital_admin' && !(await HospitalMembership.exists({ hospital: hospitalId, user: req.user._id, role: 'hospital_admin', status: 'active' }))) throw new HttpError(403, 'You do not administer this hospital');
    filter.hospital = hospitalId;
  } else if (req.user.role === 'hospital_admin') {
    const hospitals = await HospitalMembership.find({ user: req.user._id, role: 'hospital_admin', status: 'active' }).distinct('hospital');
    filter.hospital = { $in: hospitals };
  }
  const consents = await PatientConsent.find(filter).populate('hospital', 'name code').sort({ updatedAt: -1 }).lean();
  res.json({ success: true, consents });
}));

export default router;
