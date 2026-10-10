import { Router } from 'express';
import { User } from '../models/User.js';
import { MedicalProfile } from '../models/MedicalProfile.js';
import { BaselineAssessment } from '../models/BaselineAssessment.js';
import { MaterialSession } from '../models/MaterialSession.js';
import { DialysisSession } from '../models/DialysisSession.js';
import { ImageAsset } from '../models/ImageAsset.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId, isPlainObject, str, toInt, toNum, pick, cleanCounts, cleanPrimitives } from '../utils/clean.js';
import { assertCanAccess, getPatientFor, resolvePatientId } from '../services/access.js';
import { storeImage } from '../services/storage.js';
import { baseUrl, buildMaterialPayloads, formatBaseline, formatImage, formatProfile } from '../services/formatters.js';

const router = Router();
router.use(protect);

const STAFF = restrictTo('doctor', 'admin');
const PATIENT = restrictTo('patient');
const MAX_IMAGES_PER_OWNER = 10;

async function loadMaterial(user, id, patientIdHint) {
  if (!isId(id)) throw new HttpError(400, 'A valid materialSessionId is required');
  const ms = await MaterialSession.findById(id);
  if (!ms || (patientIdHint && String(ms.patient) !== String(patientIdHint))) {
    throw new HttpError(404, 'Material session not found');
  }
  const patient = await User.findById(ms.patient);
  assertCanAccess(user, patient);
  return { ms, patient };
}

// ───────────────────────── Doctor: patients & records ─────────────────────────

// POST /api/upload/doctor/patients  { doctorId } -> { success, patients:[{_id,name,email}] }
router.post(
  '/doctor/patients',
  STAFF,
  ah(async (req, res) => {
    let doctorId = req.body?.doctorId;
    if (req.user.role === 'doctor') {
      if (doctorId && String(doctorId) !== String(req.user._id)) {
        throw new HttpError(403, 'You can only list your own patients');
      }
      doctorId = String(req.user._id);
    }
    if (!isId(doctorId)) throw new HttpError(400, 'A valid doctorId is required');

    const patients = await User.find({ role: 'patient', assignedDoctor: doctorId }).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      count: patients.length,
      patients: patients.map((p) => ({ _id: String(p._id), id: String(p._id), name: p.name, email: p.email, phone: p.phone })),
    });
  })
);

const PROFILE_STRINGS = [
  'gender', 'crNumber', 'contactNumber', 'address', 'educationLevel', 'incomeLevel',
  'primaryDiagnosis', 'nativeKidneyDisease', 'dialysisType', 'bloodGroup', 'height', 'weight',
];
const toStringList = (v) => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : []);

// PATCH /api/upload/doctor/medical-profile  (create or update)
router.patch(
  '/doctor/medical-profile',
  STAFF,
  ah(async (req, res) => {
    const patient = await getPatientFor(req.user, req.body?.patientId);
    const b = req.body;

    const set = { updatedBy: req.user._id };
    for (const k of PROFILE_STRINGS) if (b[k] !== undefined) set[k] = str(b[k]).trim();
    if (b.age !== undefined) set.age = Math.max(0, toInt(b.age, 0));
    if (b.allergies !== undefined) set.allergies = toStringList(b.allergies);
    if (b.comorbidities !== undefined) set.comorbidities = toStringList(b.comorbidities);
    if (isPlainObject(b.emergencyContact)) {
      for (const k of ['name', 'phone', 'relation']) {
        if (b.emergencyContact[k] !== undefined) set[`emergencyContact.${k}`] = str(b.emergencyContact[k]).trim();
      }
    }

    const doc = await MedicalProfile.findOneAndUpdate(
      { patient: patient._id },
      { $set: set },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, message: 'Medical profile saved', profile: formatProfile(doc, patient._id) });
  })
);

const BASELINE_FIELDS = [
  'primaryDiagnosis', 'nativeKidneyDisease', 'dialysisType', 'catheterTechnique',
  'pdCatheterInsertionDate', 'pdStartDate', 'trainingStartDate', 'trainingCompletionDate',
  'periImplantComplications', 'clinicalExam', 'pdPrescription', 'labs', 'planAndAdvice',
];
const DATE_FIELDS = ['pdCatheterInsertionDate', 'pdStartDate', 'trainingStartDate', 'trainingCompletionDate'];
const dateOrNull = (v) => (v ? String(v).slice(0, 10) : null);

// PATCH /api/upload/doctor/baseline-assessment  (create or update)
router.patch(
  '/doctor/baseline-assessment',
  STAFF,
  ah(async (req, res) => {
    const patient = await getPatientFor(req.user, req.body?.patientId);
    const set = { ...pick(req.body, BASELINE_FIELDS), updatedBy: req.user._id };
    for (const k of DATE_FIELDS) if (k in set) set[k] = dateOrNull(set[k]);
    if ('labs' in set && isPlainObject(set.labs)) {
      for (const lab of Object.values(set.labs)) if (isPlainObject(lab)) lab.date = dateOrNull(lab.date);
    }
    if ('pdPrescription' in set && !Array.isArray(set.pdPrescription)) {
      throw new HttpError(400, 'pdPrescription must be a list');
    }

    const doc = await BaselineAssessment.findOneAndUpdate(
      { patient: patient._id },
      { $set: set },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, message: 'Baseline assessment saved', baselineAssessment: formatBaseline(doc) });
  })
);

// POST /api/upload/medical-profile  { patientId }  (doctor, or the patient themself)
router.post(
  '/medical-profile',
  ah(async (req, res) => {
    const patient = await getPatientFor(req.user, resolvePatientId(req));
    const [profile, baseline] = await Promise.all([
      MedicalProfile.findOne({ patient: patient._id }).lean(),
      BaselineAssessment.findOne({ patient: patient._id }).lean(),
    ]);
    res.json({
      success: true,
      profile: formatProfile(profile, patient._id),
      medicalProfile: profile ? formatProfile(profile, patient._id) : null,
      baselineAssessment: formatBaseline(baseline),
    });
  })
);

// ───────────────────────── Material kits ─────────────────────────

// POST /api/upload/start-material-session  (doctor issues a kit)
router.post(
  '/start-material-session',
  STAFF,
  ah(async (req, res) => {
    const { sessionsCount, pdMaterials, notes } = req.body || {};
    const patient = await getPatientFor(req.user, req.body?.patientId);

    const count = toInt(sessionsCount, 0);
    if (count < 1 || count > 366) throw new HttpError(400, 'sessionsCount must be between 1 and 366');
    const m = isPlainObject(pdMaterials) ? pdMaterials : {};

    const ms = await MaterialSession.create({
      patient: patient._id,
      doctor: req.user.role === 'doctor' ? req.user._id : patient.assignedDoctor || req.user._id,
      sessionsCount: count,
      pdMaterials: {
        transferSet: Math.max(0, toInt(m.transferSet)),
        capd: cleanCounts(m.capd),
        apd: cleanCounts(m.apd),
        icodextrin2L: Math.max(0, toInt(m.icodextrin2L)),
        minicap: Math.max(0, toInt(m.minicap)),
        others: cleanPrimitives(m.others),
      },
      notes: str(notes).trim(),
    });

    res.json({
      success: true,
      message: 'Material session created',
      session: { _id: String(ms._id), id: String(ms._id), materialSessionId: String(ms._id), status: ms.status },
    });
  })
);

// POST /api/upload/patient/material-summary  { patientId? } -> patient + all kits
router.post(
  '/patient/material-summary',
  ah(async (req, res) => {
    const patient = await getPatientFor(req.user, resolvePatientId(req));
    const kits = await MaterialSession.find({ patient: patient._id }).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      patient: { id: String(patient._id), name: patient.name, email: patient.email },
      materialSessions: await buildMaterialPayloads(kits, baseUrl(req)),
    });
  })
);

// POST /api/upload/material/session-details  { materialSessionId, patientId? }
router.post(
  '/material/session-details',
  ah(async (req, res) => {
    const { ms } = await loadMaterial(req.user, req.body?.materialSessionId, req.body?.patientId);
    const [payload] = await buildMaterialPayloads([ms.toObject()], baseUrl(req));
    res.json({ success: true, materialSession: payload });
  })
);

// PATCH /api/upload/acknowledge-material-session  { sessionId }  (patient confirms receipt)
router.patch(
  '/acknowledge-material-session',
  PATIENT,
  ah(async (req, res) => {
    const { sessionId } = req.body || {};
    if (!isId(sessionId)) throw new HttpError(400, 'A valid sessionId is required');
    const ms = await MaterialSession.findOne({ _id: sessionId, patient: req.user._id });
    if (!ms) throw new HttpError(404, 'Material session not found');

    if (ms.status !== 'acknowledged') {
      ms.status = 'acknowledged';
      ms.acknowledgedAt = new Date();
      await ms.save();
    }
    res.json({ success: true, message: 'Materials acknowledged', status: ms.status, acknowledgedAt: ms.acknowledgedAt });
  })
);

// ───────────────────────── Dialysis sessions ─────────────────────────

// POST /api/upload/start-dialysis-session  { materialSessionId } -> { session:{ _id } }
router.post(
  '/start-dialysis-session',
  PATIENT,
  ah(async (req, res) => {
    const { materialSessionId } = req.body || {};
    if (!isId(materialSessionId)) throw new HttpError(400, 'A valid materialSessionId is required');
    const ms = await MaterialSession.findOne({ _id: materialSessionId, patient: req.user._id });
    if (!ms) throw new HttpError(404, 'Material session not found');
    if (ms.status !== 'acknowledged') throw new HttpError(409, 'Please acknowledge the materials before starting');

    const reply = (s, resumed) =>
      res.json({
        success: true,
        message: resumed ? 'Resuming your session in progress' : 'Dialysis session started',
        session: { _id: String(s._id), id: String(s._id), sessionId: String(s._id), sequence: s.sequence, status: s.status },
      });

    // Leaving the form and coming back resumes the same day instead of burning a session.
    const existing = await DialysisSession.findOne({ materialSession: ms._id, status: 'active' });
    if (existing) return reply(existing, true);

    const sessions = await DialysisSession.find({ materialSession: ms._id, status: { $ne: 'cancelled' } })
      .select('sequence status')
      .lean();
    if (sessions.length >= ms.sessionsCount) throw new HttpError(409, 'No sessions remaining in this kit');
    const sequence = sessions.reduce((max, s) => Math.max(max, s.sequence), 0) + 1;

    try {
      const created = await DialysisSession.create({
        materialSession: ms._id,
        patient: req.user._id,
        doctor: ms.doctor,
        sequence,
      });
      return reply(created, false);
    } catch (err) {
      if (err.code === 11000) {
        const raced = await DialysisSession.findOne({ materialSession: ms._id, status: 'active' });
        if (raced) return reply(raced, true);
      }
      throw err;
    }
  })
);

const READING_KEYS = ['fillVolume', 'drainVolume', 'fillTime', 'drainTime'];

// PATCH /api/upload/finish-dialysis-session  { sessionId, symptoms:{...}, readings?:{...} }
router.patch(
  '/finish-dialysis-session',
  PATIENT,
  ah(async (req, res) => {
    const { sessionId, symptoms, readings } = req.body || {};
    if (!isId(sessionId)) throw new HttpError(400, 'A valid sessionId is required');
    if (!isPlainObject(symptoms)) throw new HttpError(400, 'symptoms are required');

    const s = await DialysisSession.findOne({ _id: sessionId, patient: req.user._id });
    if (!s) throw new HttpError(404, 'Dialysis session not found');
    if (s.status !== 'active') throw new HttpError(409, `Session is already ${s.status}`);

    s.voluntary = symptoms; // schema whitelists fields and casts types
    if (isPlainObject(readings)) {
      s.readings = Object.fromEntries(READING_KEYS.map((k) => [k, toNum(readings[k], 0)]));
    }
    s.status = 'completed';
    s.completedAt = new Date();
    await s.save();

    res.json({ success: true, message: 'Dialysis session completed', session: { _id: String(s._id), status: s.status } });
  })
);

// PATCH /api/upload/verify-dialysis-session  { sessionId, verificationNotes }
router.patch(
  '/verify-dialysis-session',
  STAFF,
  ah(async (req, res) => {
    const { sessionId, verificationNotes } = req.body || {};
    if (!isId(sessionId)) throw new HttpError(400, 'A valid sessionId is required');
    const s = await DialysisSession.findById(sessionId);
    if (!s) throw new HttpError(404, 'Dialysis session not found');
    assertCanAccess(req.user, await User.findById(s.patient));

    if (s.status === 'verified') throw new HttpError(409, 'Session is already verified');
    if (s.status !== 'completed') throw new HttpError(409, 'Only completed sessions can be verified');

    s.status = 'verified';
    s.verifiedAt = new Date();
    s.verifiedBy = req.user._id;
    s.verifiedByName = req.user.name;
    s.verificationNotes = str(verificationNotes).trim();
    await s.save();

    res.json({ success: true, message: 'Session verified', session: { _id: String(s._id), status: s.status } });
  })
);

// ───────────────────────── Images ─────────────────────────

// POST /api/upload/upload  multipart: image=<file>, sessionId=<material OR dialysis session id>
router.post(
  '/upload',
  imageUpload,
  ah(async (req, res) => {
    const { sessionId } = req.body || {};
    if (!isId(sessionId)) throw new HttpError(400, 'A valid sessionId is required');
    if (!req.file) throw new HttpError(400, 'Image file is required (form field "image")');

    let ownerType;
    let patientId;
    const kit = await MaterialSession.findById(sessionId);
    if (kit) {
      if (!['doctor', 'admin'].includes(req.user.role)) throw new HttpError(403, 'Only doctors can attach kit photos');
      assertCanAccess(req.user, await User.findById(kit.patient));
      ownerType = 'material';
      patientId = kit.patient;
    } else {
      const day = await DialysisSession.findById(sessionId);
      if (!day) throw new HttpError(404, 'Session not found');
      if (req.user.role !== 'patient' || String(day.patient) !== String(req.user._id)) {
        throw new HttpError(403, 'You cannot add photos to this session');
      }
      if (day.status !== 'active') throw new HttpError(409, 'Photos can only be added while a session is in progress');
      ownerType = 'dialysis';
      patientId = day.patient;
    }

    if ((await ImageAsset.countDocuments({ ownerId: sessionId })) >= MAX_IMAGES_PER_OWNER) {
      throw new HttpError(409, `A maximum of ${MAX_IMAGES_PER_OWNER} photos is allowed`);
    }

    const stored = await storeImage(req.file.buffer);
    const asset = await ImageAsset.create({
      ownerType,
      ownerId: sessionId,
      patient: patientId,
      uploadedBy: req.user._id,
      ...stored,
    });

    res.json({ success: true, message: 'Image uploaded', image: formatImage(asset.toObject(), baseUrl(req)) });
  })
);

export default router;
