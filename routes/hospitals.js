import { Router } from 'express';
import { Hospital } from '../models/Hospital.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { PatientHospitalRelationship } from '../models/PatientHospitalRelationship.js';
import { User } from '../models/User.js';
import { isId } from '../utils/clean.js';
import crypto from 'node:crypto';
import { HospitalInvitation } from '../models/HospitalInvitation.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { signToken } from '../middleware/auth.js';
import { requireHospitalAccess } from '../middleware/hospitalAccess.js';
import { HttpError, ah } from '../utils/errors.js';
import { BaselineAssessment } from '../models/BaselineAssessment.js';
import { DialysisSession } from '../models/DialysisSession.js';
import { MedicalProfile } from '../models/MedicalProfile.js';

const router = Router();

const ADMIN = restrictTo('admin', 'platform_admin');
const HOSPITAL_OPERATORS = restrictTo('admin', 'platform_admin', 'hospital_admin');
const CLINICAL_STAFF = restrictTo('admin', 'platform_admin', 'hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer');
const INVITE_ROLES = ['hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer', 'patient'];

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Invitation activation is intentionally public: the invitation token is the
// credential used to establish the account and obtain the first session token.
router.post('/invitations/accept', ah(async (req, res) => {
  const { token, password, phone = '' } = req.body || {};
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'A valid invitation token and password of at least 8 characters are required');
  }
  const invitation = await HospitalInvitation.findOne({ tokenHash: tokenHash(token), acceptedAt: null }).select('+tokenHash');
  if (!invitation || invitation.expiresAt <= new Date()) throw new HttpError(400, 'Invitation is invalid or expired');
  if (invitation.role === 'patient' && !invitation.mrn) throw new HttpError(400, 'Patient invitation is missing an MRN');
  let user = await User.findOne({ email: invitation.email }).select('+passwordHash');
  if (user && (user.role !== invitation.role || invitation.role !== 'patient')) throw new HttpError(409, 'An account with this email already exists');
  if (!user) user = await User.create({ name: invitation.name, email: invitation.email, phone: String(phone).trim(), passwordHash: await User.hashPassword(password), role: invitation.role, supervisingDoctor: invitation.supervisingDoctor });
  else { user.passwordHash = await User.hashPassword(password); if (phone) user.phone = String(phone).trim(); user.accountStatus = 'active'; await user.save(); }
  await HospitalMembership.updateOne({ hospital: invitation.hospital, user: user._id }, { $setOnInsert: { hospital: invitation.hospital, user: user._id, role: invitation.role, mrn: invitation.role === 'patient' ? invitation.mrn : '', supervisingDoctor: invitation.supervisingDoctor } }, { upsert: true });
  if (invitation.role === 'patient' && !(await PatientHospitalRelationship.exists({ patient: user._id, hospital: invitation.hospital }))) await PatientHospitalRelationship.create({ patient: user._id, hospital: invitation.hospital, mrn: invitation.mrn, primaryDoctor: null });
  invitation.acceptedAt = new Date();
  await invitation.save();
  await AuditEvent.create({ actor: user._id, hospital: invitation.hospital, action: 'hospital.invitation.accepted', resourceType: 'HospitalInvitation', resourceId: String(invitation._id) });
  res.status(201).json({ success: true, token: signToken(user), user: { id: String(user._id), name: user.name, email: user.email, role: user.role } });
}));

router.use(protect);

router.post('/', ADMIN, ah(async (req, res) => {
  const { name, code = '', address = '', phone = '' } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Hospital name is required');
  const base = String(code).trim() || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'HOSPITAL';
  let generatedCode = base;
  for (let suffix = 2; await Hospital.exists({ code: generatedCode }); suffix += 1) generatedCode = `${base.slice(0, Math.max(1, 20 - String(suffix).length - 1))}-${suffix}`;
  const hospital = await Hospital.create({ name: name.trim(), code: generatedCode, address: String(address).trim(), phone: String(phone).trim(), createdBy: req.user._id });
  await AuditEvent.create({ actor: req.user._id, hospital: hospital._id, action: 'hospital.created', resourceType: 'Hospital', resourceId: String(hospital._id) });
  res.status(201).json({ success: true, hospital });
}));

router.patch('/:hospitalId/status', ADMIN, requireHospitalAccess(), ah(async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(status)) throw new HttpError(400, 'Status must be active or suspended');
  const hospital = await Hospital.findByIdAndUpdate(req.params.hospitalId, { status }, { new: true, runValidators: true }).lean();
  if (!hospital) throw new HttpError(404, 'Hospital not found');
  await AuditEvent.create({ actor: req.user._id, hospital: hospital._id, action: `hospital.${status === 'active' ? 'activated' : 'suspended'}`, resourceType: 'Hospital', resourceId: String(hospital._id) });
  res.json({ success: true, hospital });
}));

router.patch('/:hospitalId/configuration', HOSPITAL_OPERATORS, requireHospitalAccess('hospital_admin'), ah(async (req, res) => {
  const { name, address = '', phone = '' } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Hospital name is required');
  const hospital = await Hospital.findByIdAndUpdate(req.params.hospitalId, { name: name.trim(), address: String(address).trim(), phone: String(phone).trim() }, { new: true, runValidators: true }).lean();
  if (!hospital) throw new HttpError(404, 'Hospital not found');
  await AuditEvent.create({ actor: req.user._id, hospital: hospital._id, action: 'hospital.configuration.updated', resourceType: 'Hospital', resourceId: String(hospital._id) });
  res.json({ success: true, hospital });
}));

router.get('/', ah(async (req, res) => {
  if (!['admin', 'platform_admin'].includes(req.user.role)) {
    const memberships = await HospitalMembership.find({ user: req.user._id, status: 'active' }).select('hospital role').populate('hospital').lean();
    return res.json({ success: true, hospitals: memberships.filter((item) => item.hospital).map((item) => ({ ...item.hospital, membershipRole: item.role })) });
  }
  const hospitals = await Hospital.find().sort({ name: 1 }).lean();
  res.json({ success: true, hospitals });
}));

router.get('/my', ah(async (req, res) => {
  if (['admin', 'platform_admin'].includes(req.user.role)) {
    const hospitals = await Hospital.find().sort({ name: 1 }).lean();
    return res.json({ success: true, hospitals });
  }
  const memberships = await HospitalMembership.find({ user: req.user._id, status: 'active' }).select('hospital role').populate('hospital').lean();
  res.json({ success: true, hospitals: memberships.filter((item) => item.hospital).map((item) => ({ ...item.hospital, membershipRole: item.role })) });
}));

router.get('/directory', ah(async (req, res) => {
  if (!['admin', 'platform_admin', 'hospital_admin'].includes(req.user.role)) throw new HttpError(403, 'Permission denied');
  const hospitals = await Hospital.find({ status: 'active' }).select('name code status').sort({ name: 1 }).lean();
  res.json({ success: true, hospitals });
}));

router.get('/platform/overview', restrictTo('admin', 'platform_admin'), ah(async (_req, res) => {
  const [hospitals, users, memberships] = await Promise.all([
    Hospital.countDocuments(),
    User.countDocuments({ accountStatus: 'active' }),
    HospitalMembership.countDocuments({ status: 'active' }),
  ]);
  res.json({ success: true, overview: { hospitals, activeUsers: users, activeMemberships: memberships } });
}));

router.get('/:hospitalId/overview', CLINICAL_STAFF, requireHospitalAccess('hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer'), ah(async (req, res) => {
  const hospitalId = req.params.hospitalId;
  const relationships = await PatientHospitalRelationship.find({ hospital: hospitalId, status: 'active' }).select('patient').lean();
  const patientIds = relationships.map((item) => item.patient);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const [sessionsToday, assessedPatients, careTeam] = await Promise.all([
    DialysisSession.countDocuments({ hospital: hospitalId, startedAt: { $gte: start, $lt: end } }),
    BaselineAssessment.countDocuments({ hospital: hospitalId, patient: { $in: patientIds } }),
    HospitalMembership.countDocuments({ hospital: hospitalId, status: 'active', role: { $ne: 'patient' } }),
  ]);
  res.json({ success: true, overview: { activePatients: patientIds.length, sessionsToday, pendingAssessments: Math.max(0, patientIds.length - assessedPatients), careTeam } });
}));

router.get('/:hospitalId/operations', HOSPITAL_OPERATORS, requireHospitalAccess('hospital_admin'), ah(async (req, res) => {
  const hospitalId = req.params.hospitalId;
  const relationships = await PatientHospitalRelationship.find({ hospital: hospitalId, status: 'active' }).populate('patient', 'name email phone').populate('primaryDoctor', 'name email').lean();
  const patientIds = relationships.map((item) => item.patient?._id).filter(Boolean);
  const [assessments, sessions, riskSessions, recentSessions] = await Promise.all([
    BaselineAssessment.find({ hospital: hospitalId, patient: { $in: patientIds } }).select('patient').lean(),
    DialysisSession.find({ hospital: hospitalId, patient: { $in: patientIds } }).select('patient status startedAt sequence').sort({ startedAt: -1 }).lean(),
    DialysisSession.find({ hospital: hospitalId, patient: { $in: patientIds }, $or: [{ 'voluntary.suddenUnwell': true }, { 'voluntary.newAbdominalPain': true }, { 'voluntary.breathlessness': true }, { 'voluntary.fever': true }, { 'voluntary.comments': { $regex: /urgent|review|unwell/i } }] }).select('patient status startedAt voluntary.comments').sort({ startedAt: -1 }).limit(50).populate('patient', 'name email').lean(),
    DialysisSession.find({ hospital: hospitalId, patient: { $in: patientIds }, startedAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } }).select('patient').lean(),
  ]);
  const assessed = new Set(assessments.map((item) => String(item.patient)));
  const recent = new Set(recentSessions.map((item) => String(item.patient)));
  const pendingAssessments = relationships.filter((item) => item.patient && !assessed.has(String(item.patient._id))).map((item) => ({ relationshipId: item._id, patient: item.patient, primaryDoctor: item.primaryDoctor }));
  const unassignedPatients = relationships.filter((item) => !item.primaryDoctor).map((item) => ({ relationshipId: item._id, patient: item.patient }));
  const pendingVerification = sessions.filter((item) => item.status === 'completed').map((item) => ({ patient: relationships.find((rel) => String(rel.patient?._id) === String(item.patient))?.patient, sequence: item.sequence, startedAt: item.startedAt }));
  const followUpPatients = relationships.filter((item) => item.patient && !recent.has(String(item.patient._id))).map((item) => ({ relationshipId: item._id, patient: item.patient, primaryDoctor: item.primaryDoctor, reason: 'No PD session recorded in the last 14 days' }));
  const workloadMap = new Map();
  for (const item of relationships) { if (!item.primaryDoctor) continue; const key = String(item.primaryDoctor._id); const current = workloadMap.get(key) || { doctor: item.primaryDoctor, patientCount: 0 }; current.patientCount += 1; workloadMap.set(key, current); }
  res.json({ success: true, operations: { metrics: { activePatients: relationships.length, unassignedPatients: unassignedPatients.length, pendingAssessments: pendingAssessments.length, pendingVerification: pendingVerification.length, riskPatients: riskSessions.length, followUpPatients: followUpPatients.length }, unassignedPatients, pendingAssessments, pendingVerification, riskPatients: riskSessions, followUpPatients, doctorWorkload: [...workloadMap.values()].sort((a, b) => b.patientCount - a.patientCount) } });
}));

router.get('/:hospitalId/doctor-worklist', restrictTo('doctor', 'assistant_doctor'), requireHospitalAccess('doctor', 'assistant_doctor'), ah(async (req, res) => {
  const hospitalId = req.params.hospitalId;
  const relationshipFilter = req.user.role === 'assistant_doctor' ? { assistantDoctors: req.user._id } : { primaryDoctor: req.user._id };
  const relationships = await PatientHospitalRelationship.find({ hospital: hospitalId, status: 'active', ...relationshipFilter }).populate('patient', 'name email').lean();
  const patientIds = relationships.map((item) => item.patient?._id).filter(Boolean);
  const [pendingVerification, riskSessions] = await Promise.all([
    DialysisSession.countDocuments({ hospital: hospitalId, doctor: req.user._id, patient: { $in: patientIds }, status: 'completed' }),
    DialysisSession.find({ hospital: hospitalId, patient: { $in: patientIds }, $or: [{ 'voluntary.suddenUnwell': true }, { 'voluntary.newAbdominalPain': true }, { 'voluntary.breathlessness': true }, { 'voluntary.fever': true }, { 'voluntary.comments': { $regex: /urgent|review|unwell/i } }] }).select('patient sequence startedAt').sort({ startedAt: -1 }).limit(25).populate('patient', 'name email').lean(),
  ]);
  const followUpPatients = relationships.filter((item) => !item.consentStatus || item.consentStatus !== 'granted').map((item) => ({ patient: item.patient, reason: 'Consent or follow-up review required' }));
  res.json({ success: true, worklist: { assignedPatients: relationships, pendingVerification, riskPatients: riskSessions, followUpPatients } });
}));

router.post('/:hospitalId/memberships', HOSPITAL_OPERATORS, requireHospitalAccess(), ah(async (req, res) => {
  const { userId, role, mrn = '', supervisingDoctor = null } = req.body || {};
  const allowed = ['hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer', 'patient'];
  if (!userId || !allowed.includes(role)) throw new HttpError(400, 'userId and a valid hospital role are required');
  const targetUser = await User.findById(userId).select('role accountStatus').lean();
  if (!targetUser || targetUser.accountStatus !== 'active' || targetUser.role !== role) throw new HttpError(400, 'The user role does not match the hospital membership role');
  if (supervisingDoctor && !(await HospitalMembership.exists({ hospital: req.params.hospitalId, user: supervisingDoctor, role: 'doctor', status: 'active' }))) throw new HttpError(400, 'Supervising doctor is not active in this hospital');
  const membership = await HospitalMembership.create({ hospital: req.params.hospitalId, user: userId, role, mrn: String(mrn).trim(), supervisingDoctor: supervisingDoctor || null });
  await AuditEvent.create({ actor: req.user._id, hospital: req.params.hospitalId, action: 'hospital.membership.created', resourceType: 'HospitalMembership', resourceId: String(membership._id), metadata: { userId, role } });
  res.status(201).json({ success: true, membership });
}));

router.get('/:hospitalId/memberships', HOSPITAL_OPERATORS, requireHospitalAccess(), ah(async (req, res) => {
  const memberships = await HospitalMembership.find({ hospital: req.params.hospitalId }).populate('user', 'name email role').populate('supervisingDoctor', 'name email').sort({ createdAt: -1 }).lean();
  res.json({ success: true, memberships });
}));

router.patch('/:hospitalId/memberships/:membershipId/status', HOSPITAL_OPERATORS, requireHospitalAccess(), ah(async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(status) || !isId(req.params.membershipId)) throw new HttpError(400, 'Valid membershipId and status are required');
  const membership = await HospitalMembership.findOneAndUpdate({ _id: req.params.membershipId, hospital: req.params.hospitalId }, { status }, { new: true }).populate('user', 'name email role').lean();
  if (!membership) throw new HttpError(404, 'Hospital membership not found');
  await AuditEvent.create({ actor: req.user._id, hospital: req.params.hospitalId, action: `hospital.membership.${status}`, resourceType: 'HospitalMembership', resourceId: String(membership._id), metadata: { userId: String(membership.user?._id || membership.user), status } });
  res.json({ success: true, membership });
}));

router.post('/:hospitalId/invitations', CLINICAL_STAFF, requireHospitalAccess('hospital_admin', 'doctor'), ah(async (req, res) => {
  const { email, name, role, mrn = '', supervisingDoctor = null, expiresInHours = 72 } = req.body || {};
  if (typeof email !== 'string' || !email.trim() || typeof name !== 'string' || !name.trim() || !INVITE_ROLES.includes(role)) {
    throw new HttpError(400, 'Email, name, and a valid role are required');
  }
  if (role === 'assistant_doctor' && supervisingDoctor && !(await HospitalMembership.exists({ hospital: req.params.hospitalId, user: supervisingDoctor, role: 'doctor', status: 'active' }))) {
    throw new HttpError(400, 'Supervising doctor is not active in this hospital');
  }
  const hours = Number(expiresInHours);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) throw new HttpError(400, 'expiresInHours must be between 1 and 168');
  const rawToken = crypto.randomBytes(32).toString('hex');
  const invitation = await HospitalInvitation.create({
    hospital: req.params.hospitalId,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    role,
    mrn: String(mrn).trim(),
    supervisingDoctor: supervisingDoctor || null,
    invitedBy: req.user._id,
    tokenHash: tokenHash(rawToken),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
  });
  await AuditEvent.create({ actor: req.user._id, hospital: req.params.hospitalId, action: 'hospital.invitation.created', resourceType: 'HospitalInvitation', resourceId: String(invitation._id), metadata: { email: invitation.email, role } });
  res.status(201).json({ success: true, invitationId: String(invitation._id), token: rawToken, expiresAt: invitation.expiresAt });
}));

router.post('/:hospitalId/patient-relationships', CLINICAL_STAFF, requireHospitalAccess('hospital_admin', 'doctor'), ah(async (req, res) => {
  const { patientId, mrn, primaryDoctor = null, assistantDoctorId = null } = req.body || {};
  if (!isId(patientId) || typeof mrn !== 'string' || !mrn.trim()) {
    throw new HttpError(400, 'patientId and MRN are required');
  }
  const patient = await User.findOne({ _id: patientId, role: 'patient' }).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const doctorId = primaryDoctor || (req.user.role === 'doctor' ? req.user._id : null);
  if (doctorId && !(await HospitalMembership.exists({ hospital: req.params.hospitalId, user: doctorId, role: 'doctor', status: 'active' }))) throw new HttpError(400, 'Primary doctor is not active in this hospital');
  if (assistantDoctorId && !(await HospitalMembership.exists({ hospital: req.params.hospitalId, user: assistantDoctorId, role: 'assistant_doctor', status: 'active' }))) throw new HttpError(400, 'Assistant doctor is not active in this hospital');

  const relationship = await PatientHospitalRelationship.create({
    patient: patientId,
    hospital: req.params.hospitalId,
    mrn: mrn.trim(),
    primaryDoctor: doctorId,
    assistantDoctors: assistantDoctorId ? [assistantDoctorId] : [],
  });
  await AuditEvent.create({ actor: req.user._id, hospital: req.params.hospitalId, action: 'patient.relationship.created', resourceType: 'PatientHospitalRelationship', resourceId: String(relationship._id), metadata: { patientId, mrn: mrn.trim() } });
  res.status(201).json({ success: true, relationship });
}));

router.post('/:hospitalId/patients', restrictTo('hospital_admin'), requireHospitalAccess('hospital_admin'), ah(async (req, res) => {
  const { name, email = '', phone = '', mrn = '', dateOfBirth = '', gender = '', address = '', emergencyContact = {}, bloodGroup = '', allergies = [], comorbidities = [], primaryDiagnosis = '', dialysisType = '', primaryDoctor = null, assistantDoctorIds = [], careTeamIds = [] } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Patient name is required');
  const cleanEmail = String(email).trim().toLowerCase();
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new HttpError(400, 'Please provide a valid patient email');
  const hospital = await Hospital.findById(req.params.hospitalId).select('code status').lean();
  if (!hospital) throw new HttpError(404, 'Hospital not found');
  if (hospital.status !== 'active') throw new HttpError(409, 'Patients cannot be registered in a suspended hospital');
  const normalizedMrn = String(mrn).trim() || `${hospital.code}-${String(Date.now()).slice(-6)}`;
  if (await PatientHospitalRelationship.exists({ hospital: req.params.hospitalId, mrn: normalizedMrn })) throw new HttpError(409, 'This MRN is already in use at this hospital');
  if (cleanEmail && await User.exists({ email: cleanEmail })) throw new HttpError(409, 'A user with this email already exists');
  const resolveStaff = async (ids, role) => {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(isId).map(String))];
    if (!unique.length) return [];
    const memberships = await HospitalMembership.find({ hospital: req.params.hospitalId, user: { $in: unique }, role, status: 'active' }).select('user').lean();
    if (memberships.length !== unique.length) throw new HttpError(400, `Every selected ${role.replace('_', ' ')} must be active in this hospital`);
    return memberships.map((item) => item.user);
  };
  let primary = null;
  if (primaryDoctor && !isId(primaryDoctor)) throw new HttpError(400, 'Invalid primary doctor');
  if (primaryDoctor) {
    const found = await HospitalMembership.exists({ hospital: req.params.hospitalId, user: primaryDoctor, role: 'doctor', status: 'active' });
    if (!found) throw new HttpError(400, 'Selected primary doctor is not active in this hospital');
    primary = primaryDoctor;
  }
  const assistants = await resolveStaff(assistantDoctorIds, 'assistant_doctor');
  const careTeamIdsClean = [...new Set((Array.isArray(careTeamIds) ? careTeamIds : []).filter(isId).map(String))];
  const careTeamMemberships = await HospitalMembership.find({ hospital: req.params.hospitalId, user: { $in: careTeamIdsClean }, role: { $in: ['nurse', 'dialysis_technician', 'pharmacist', 'records_officer'] }, status: 'active' }).select('user').lean();
  if (careTeamMemberships.length !== careTeamIdsClean.length) throw new HttpError(400, 'Every selected care-team member must be active clinical staff in this hospital');
  const careTeam = careTeamMemberships.map((item) => item.user);
  const internalEmail = cleanEmail || `patient-${hospital.code.toLowerCase()}-${crypto.randomUUID()}@no-email.local`;
  const temporaryPassword = crypto.randomBytes(18).toString('hex');
  const patient = await User.create({ name: name.trim(), email: internalEmail, phone: String(phone).trim(), passwordHash: await User.hashPassword(temporaryPassword), role: 'patient' });
  try {
    await HospitalMembership.create({ hospital: req.params.hospitalId, user: patient._id, role: 'patient', mrn: normalizedMrn });
    const relationship = await PatientHospitalRelationship.create({ patient: patient._id, hospital: req.params.hospitalId, mrn: normalizedMrn, primaryDoctor: primary, assistantDoctors: assistants, careTeam });
    await MedicalProfile.create({ patient: patient._id, hospital: req.params.hospitalId, contactNumber: String(phone).trim(), address: String(address).trim(), gender: String(gender).trim(), dateOfBirth: String(dateOfBirth).trim(), emergencyContact: { name: String(emergencyContact?.name || '').trim(), phone: String(emergencyContact?.phone || '').trim(), relation: String(emergencyContact?.relation || '').trim() }, bloodGroup: String(bloodGroup).trim(), allergies: Array.isArray(allergies) ? allergies : [], comorbidities: Array.isArray(comorbidities) ? comorbidities : [], primaryDiagnosis: String(primaryDiagnosis).trim(), dialysisType: String(dialysisType).trim(), updatedBy: req.user._id });
    await AuditEvent.create({ actor: req.user._id, hospital: req.params.hospitalId, action: 'patient.registered', resourceType: 'Patient', resourceId: String(patient._id), metadata: { mrn: normalizedMrn, primaryDoctor: primary, assistantDoctors: assistants, careTeam } });
    const populated = await PatientHospitalRelationship.findById(relationship._id).populate('patient', 'name email phone').populate('primaryDoctor', 'name email').populate('assistantDoctors', 'name email').populate('careTeam', 'name email role').lean();
    let invitationToken = null;
    let invitationExpiresAt = null;
    if (cleanEmail) {
      invitationToken = crypto.randomBytes(32).toString('hex');
      invitationExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await HospitalInvitation.create({ hospital: req.params.hospitalId, email: cleanEmail, name: patient.name, role: 'patient', mrn: normalizedMrn, invitedBy: req.user._id, tokenHash: tokenHash(invitationToken), expiresAt: invitationExpiresAt });
    }
    res.status(201).json({ success: true, patient: { id: String(patient._id), name: patient.name, email: cleanEmail || null, phone: patient.phone }, relationship: populated, generatedEmail: cleanEmail ? null : internalEmail, invitationToken, invitationExpiresAt });
  } catch (error) {
    await HospitalMembership.deleteOne({ hospital: req.params.hospitalId, user: patient._id });
    await PatientHospitalRelationship.deleteOne({ hospital: req.params.hospitalId, patient: patient._id });
    await MedicalProfile.deleteOne({ hospital: req.params.hospitalId, patient: patient._id });
    await User.deleteOne({ _id: patient._id });
    throw error;
  }
}));

router.patch('/:hospitalId/patients/:patientId', restrictTo('hospital_admin'), requireHospitalAccess('hospital_admin'), ah(async (req, res) => {
  if (!isId(req.params.patientId)) throw new HttpError(400, 'Invalid patientId');
  const relationship = await PatientHospitalRelationship.findOne({ hospital: req.params.hospitalId, patient: req.params.patientId, status: 'active' });
  if (!relationship) throw new HttpError(404, 'Active patient relationship not found');
  const { name, email, phone, dateOfBirth, gender, address, emergencyContact, bloodGroup, allergies, comorbidities, primaryDiagnosis, dialysisType, crNumber, educationLevel, incomeLevel, height, weight, nativeKidneyDisease } = req.body || {};
  if (name !== undefined && (!String(name).trim() || String(name).trim().length > 120)) throw new HttpError(400, 'Patient name is required and must be under 120 characters');
  const userSet = {};
  for (const field of ['name', 'phone']) if (req.body[field] !== undefined) userSet[field] = String(req.body[field]).trim();
  if (email !== undefined) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new HttpError(400, 'Please provide a valid patient email');
    if (cleanEmail && await User.exists({ email: cleanEmail, _id: { $ne: req.params.patientId } })) throw new HttpError(409, 'A user with this email already exists');
    if (cleanEmail) userSet.email = cleanEmail;
  }
  if (Object.keys(userSet).length) await User.updateOne({ _id: req.params.patientId, role: 'patient' }, { $set: userSet });
  const profileSet = { updatedBy: req.user._id, hospital: req.params.hospitalId };
  for (const field of ['dateOfBirth', 'gender', 'address', 'bloodGroup', 'primaryDiagnosis', 'dialysisType', 'crNumber', 'educationLevel', 'incomeLevel', 'height', 'weight', 'nativeKidneyDisease']) if (req.body[field] !== undefined) profileSet[field] = String(req.body[field]).trim();
  if (Array.isArray(allergies)) profileSet.allergies = allergies.map((item) => String(item).trim()).filter(Boolean);
  if (Array.isArray(comorbidities)) profileSet.comorbidities = comorbidities.map((item) => String(item).trim()).filter(Boolean);
  if (emergencyContact && typeof emergencyContact === 'object') profileSet.emergencyContact = { name: String(emergencyContact.name || '').trim(), phone: String(emergencyContact.phone || '').trim(), relation: String(emergencyContact.relation || '').trim() };
  await MedicalProfile.findOneAndUpdate({ patient: req.params.patientId, hospital: req.params.hospitalId }, { $set: profileSet }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  await AuditEvent.create({ actor: req.user._id, hospital: req.params.hospitalId, action: 'patient.record.updated', resourceType: 'Patient', resourceId: req.params.patientId, metadata: { fields: Object.keys(req.body || {}).filter((field) => field !== 'password') } });
  const patient = await User.findById(req.params.patientId).select('name email phone').lean();
  const profile = await MedicalProfile.findOne({ patient: req.params.patientId, hospital: req.params.hospitalId }).lean();
  res.json({ success: true, patient, profile });
}));

router.get('/:hospitalId/patient-relationships', CLINICAL_STAFF, requireHospitalAccess('hospital_admin', 'doctor', 'assistant_doctor', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer'), ah(async (req, res) => {
  const scope = { hospital: req.params.hospitalId, status: 'active' };
  if (req.user.role === 'doctor') scope.primaryDoctor = req.user._id;
  else if (req.user.role === 'assistant_doctor') scope.assistantDoctors = req.user._id;
  else if (['nurse', 'dialysis_technician', 'pharmacist', 'records_officer'].includes(req.user.role)) scope.careTeam = req.user._id;
  const relationships = await PatientHospitalRelationship.find(scope)
    .populate('patient', 'name email phone')
    .populate('primaryDoctor', 'name email')
    .populate('assistantDoctors', 'name email')
    .populate('careTeam', 'name email role')
    .sort({ createdAt: -1 }).lean();
  res.json({ success: true, relationships });
}));

router.patch('/:hospitalId/patient-relationships/:relationshipId/assignment', CLINICAL_STAFF, requireHospitalAccess('hospital_admin', 'doctor'), ah(async (req, res) => {
  if (!isId(req.params.relationshipId)) throw new HttpError(400, 'Invalid relationshipId');
  const { primaryDoctor = null, assistantDoctorId = null, assistantDoctorIds = [], careTeamIds = [] } = req.body || {};
  if (primaryDoctor && !(await HospitalMembership.exists({ hospital: req.params.hospitalId, user: primaryDoctor, role: 'doctor', status: 'active' }))) throw new HttpError(400, 'Primary doctor is not active in this hospital');
  if (assistantDoctorId && !(await User.exists({ _id: assistantDoctorId, role: 'assistant_doctor', accountStatus: 'active' }))) throw new HttpError(400, 'Invalid assistant doctor');
  const assistants = (Array.isArray(assistantDoctorIds) && assistantDoctorIds.length ? assistantDoctorIds : (assistantDoctorId ? [assistantDoctorId] : [])).filter(isId).map(String);
  if (primaryDoctor && !isId(primaryDoctor)) throw new HttpError(400, 'Invalid primary doctor');
  const validAssistants = await HospitalMembership.find({ hospital: req.params.hospitalId, user: { $in: assistants }, role: 'assistant_doctor', status: 'active' }).distinct('user');
  if (validAssistants.length !== [...new Set(assistants)].length) throw new HttpError(400, 'Every selected assistant doctor must be active in this hospital');
  const careTeamIdsClean = [...new Set((Array.isArray(careTeamIds) ? careTeamIds : []).filter(isId).map(String))];
  const validCareTeam = await HospitalMembership.find({ hospital: req.params.hospitalId, user: { $in: careTeamIdsClean }, role: { $in: ['nurse', 'dialysis_technician', 'pharmacist', 'records_officer'] }, status: 'active' }).distinct('user');
  if (validCareTeam.length !== careTeamIdsClean.length) throw new HttpError(400, 'Every selected care-team member must be active clinical staff in this hospital');
  const relationship = await PatientHospitalRelationship.findOneAndUpdate({ _id: req.params.relationshipId, hospital: req.params.hospitalId, status: 'active' }, { primaryDoctor: primaryDoctor || null, assistantDoctors: validAssistants, careTeam: validCareTeam }, { new: true }).populate('patient', 'name email').populate('primaryDoctor', 'name email').populate('assistantDoctors', 'name email').populate('careTeam', 'name email role').lean();
  if (!relationship) throw new HttpError(404, 'Active patient relationship not found');
  await AuditEvent.create({ actor: req.user._id, hospital: req.params.hospitalId, action: 'patient.relationship.assignment_updated', resourceType: 'PatientHospitalRelationship', resourceId: String(relationship._id), metadata: { primaryDoctor, assistantDoctorId } });
  res.json({ success: true, relationship });
}));

router.get('/patients/:patientId/relationships', ah(async (req, res) => {
  if (!isId(req.params.patientId)) throw new HttpError(400, 'Invalid patientId');
  const requestedHospital = req.query.hospitalId;
  if (['admin', 'platform_admin'].includes(req.user.role)) {
    // Global administrators may review all relationships.
  } else if (String(req.user._id) === req.params.patientId) {
    // Patients may review their own relationships.
  } else {
    if (!isId(requestedHospital)) throw new HttpError(400, 'hospitalId is required');
    const patient = await User.findById(req.params.patientId).select('_id assignedDoctor');
    if (!patient) throw new HttpError(404, 'Patient not found');
    const member = await HospitalMembership.exists({ hospital: requestedHospital, user: req.user._id, status: 'active' });
    if (!member) throw new HttpError(403, 'You do not belong to this hospital');
    const relationship = await PatientHospitalRelationship.findOne({ patient: req.params.patientId, hospital: requestedHospital, status: 'active' }).lean();
    const assigned = relationship && (String(relationship.primaryDoctor) === String(req.user._id) || (relationship.assistantDoctors || []).some((id) => String(id) === String(req.user._id)) || ['hospital_admin', 'nurse', 'dialysis_technician', 'pharmacist', 'records_officer'].includes(req.user.role));
    if (!assigned) throw new HttpError(403, 'You do not have access to this patient at this hospital');
  }
  const relationshipFilter = { patient: req.params.patientId };
  if (isId(requestedHospital)) relationshipFilter.hospital = requestedHospital;
  const relationships = await PatientHospitalRelationship.find(relationshipFilter)
    .populate('hospital', 'name code status')
    .populate('primaryDoctor', 'name email')
    .populate('assistantDoctors', 'name email').lean();
  res.json({ success: true, relationships });
}));

export default router;
