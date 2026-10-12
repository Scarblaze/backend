// End-to-end test that replays the exact requests the Flutter app makes.
// Uses MongoDB Atlas and redirects the configured URI to the isolated dialysis_test database.
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret';
// Integration tests use the database-backed image store so they do not require Cloudinary credentials.
process.env.CLOUDINARY_URL = '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
const configuredMongoUri = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI;
if (!configuredMongoUri) throw new Error('MONGODB_URI or MONGODB_TEST_URI must be set for integration tests');
const testMongoUri = new URL(configuredMongoUri);
testMongoUri.pathname = '/dialysis_test';
process.env.MONGODB_URI = testMongoUri.toString();

const { default: app } = await import('../app.js');
const { default: connectDB } = await import('../config/db.js');
const { User } = await import('../models/User.js');
const { Hospital } = await import('../models/Hospital.js');
const { HospitalMembership } = await import('../models/HospitalMembership.js');

let server, base;
const S = {}; // shared state across the ordered tests

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, res };
}

async function upload(token, sessionId, bytes, filename = 'photo.png') {
  const form = new FormData();
  form.append('sessionId', sessionId);
  // Dart's http.MultipartFile sends application/octet-stream
  form.append('image', new Blob([bytes], { type: 'application/octet-stream' }), filename);
  const res = await fetch(`${base}/api/upload/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json() };
}

before(async () => {
  await connectDB();
  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  await Promise.all(collections.map(({ name }) => mongoose.connection.db.collection(name).deleteMany({})));
  await User.syncIndexes();
  await User.create({ name: 'Dr One', email: 'doctor1@example.com', passwordHash: await User.hashPassword('doctorpass'), role: 'doctor' });
  await User.create({ name: 'Dr Two', email: 'doctor2@example.com', passwordHash: await User.hashPassword('doctorpass2'), role: 'doctor' });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

test('login: success shape, bad password, case-insensitive email', async () => {
  const bad = await call('POST', '/api/auth/login', { body: { email: 'doctor1@example.com', password: 'nope' } });
  assert.equal(bad.status, 401);
  assert.equal(typeof bad.json.message, 'string');

  const ok = await call('POST', '/api/auth/login', { body: { email: ' Doctor1@Example.com ', password: 'doctorpass' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.token);
  assert.equal(ok.json.user.role, 'doctor');
  assert.match(ok.json.user.id, /^[a-f\d]{24}$/);
  assert.equal(ok.json.user.passwordHash, undefined);
  S.doc = ok.json; // { token, user }

  const d2 = await call('POST', '/api/auth/login', { body: { email: 'doctor2@example.com', password: 'doctorpass2' } });
  S.doc2 = d2.json;

  // NoSQL-injection style payload must be rejected, not matched
  const inj = await call('POST', '/api/auth/login', { body: { email: { $ne: '' }, password: { $ne: '' } } });
  assert.equal(inj.status, 400);
});

test('register patient: HTTP 200 + userId, duplicate 409, patient cannot register', async () => {
  const body = { name: 'Pat One', email: 'patient1@example.com', phone: '9999999999', password: 'secret1', role: 'patient', doctorId: S.doc.user.id };
  const r = await call('POST', '/api/auth/register', { token: S.doc.token, body });
  assert.equal(r.status, 200); // doctor_controller.dart requires exactly 200
  assert.equal(r.json.success, true);
  assert.match(r.json.userId, /^[a-f\d]{24}$/);
  S.p1 = r.json.userId;

  const dup = await call('POST', '/api/auth/register', { token: S.doc.token, body });
  assert.equal(dup.status, 409);

  // A doctor trying to create another doctor still creates a patient
  const sneaky = await call('POST', '/api/auth/register', { token: S.doc.token, body: { ...body, email: 'sneaky@example.com', role: 'doctor' } });
  assert.equal(sneaky.status, 200);
  assert.equal((await User.findById(sneaky.json.userId)).role, 'patient');

  const noAuth = await call('POST', '/api/auth/register', { body });
  assert.equal(noAuth.status, 401);

  const pl = await call('POST', '/api/auth/login', { body: { email: 'patient1@example.com', password: 'secret1' } });
  assert.equal(pl.status, 200);
  assert.equal(pl.json.user.role, 'patient');
  S.pat = pl.json;
  const forbidden = await call('POST', '/api/auth/register', { token: S.pat.token, body: { ...body, email: 'x@example.com' } });
  assert.equal(forbidden.status, 403);

  // second patient belonging to doctor 2
  const r2 = await call('POST', '/api/auth/register', { token: S.doc2.token, body: { name: 'Pat Two', email: 'patient2@example.com', password: 'secret2', role: 'patient', doctorId: S.doc2.user.id } });
  S.p2 = r2.json.userId;
});

test('doctor patient list: only own patients, { success, patients:[{_id,name,email}] }', async () => {
  const r = await call('POST', '/api/upload/doctor/patients', { token: S.doc.token, body: { doctorId: S.doc.user.id } });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  const ids = r.json.patients.map((p) => p._id);
  assert.ok(ids.includes(S.p1));
  assert.ok(!ids.includes(S.p2), 'doctor 1 must not see doctor 2 patient');
  assert.ok(r.json.patients.every((p) => p.name && p.email));

  const other = await call('POST', '/api/upload/doctor/patients', { token: S.doc.token, body: { doctorId: S.doc2.user.id } });
  assert.equal(other.status, 403);
  const asPatient = await call('POST', '/api/upload/doctor/patients', { token: S.pat.token, body: {} });
  assert.equal(asPatient.status, 403);
});

test('medical profile + baseline assessment (registration steps 2 and 3)', async () => {
  const mp = await call('PATCH', '/api/upload/doctor/medical-profile', {
    token: S.doc.token,
    body: {
      patientId: S.p1, age: 54, gender: 'Male', crNumber: 'CR-123', contactNumber: '9876543210', address: 'Nagpur',
      educationLevel: 'Graduate', incomeLevel: 'Middle', primaryDiagnosis: 'CKD 5', nativeKidneyDisease: 'Diabetic nephropathy',
      dialysisType: 'CAPD', allergies: ['Penicillin', 'Dust'], emergencyContact: { name: 'Ram', phone: '8888888888', relation: 'Son' },
    },
  });
  assert.equal(mp.status, 200, mp.text);

  const bl = await call('PATCH', '/api/upload/doctor/baseline-assessment', {
    token: S.doc.token,
    body: {
      patientId: S.p1, primaryDiagnosis: 'CKD 5', nativeKidneyDisease: 'DN', dialysisType: 'CAPD',
      pdCatheterInsertionDate: '2026-01-05', catheterTechnique: 'Laparoscopic', pdStartDate: '2026-02-01',
      trainingStartDate: null, trainingCompletionDate: '2026-02-10',
      periImplantComplications: { present: false, details: '' },
      clinicalExam: { pulse: 78, bpSystolic: 130, bpDiastolic: 80, weightKg: 70.0, heightCm: 170.0, pallor: true, icterus: false, cyanosis: false, clubbing: false, edema: true },
      pdPrescription: [{ dwellTiming: 'Night', solutionStrength: '1.5%', fillVolume: 2000, dwellDurationHours: 4, numberOfExchanges: 4, icodextrinUsed: false }],
      labs: { hemoglobin: { value: 9.5, date: '2026-01-01' }, urea: { value: 120.0, date: '2026-01-01' }, creatinine: { value: 8.0, date: null } },
      planAndAdvice: { advisedPrescription: 'CAPD 4x', medications: 'EPO', followUpInstructions: '2 weeks' },
    },
  });
  assert.equal(bl.status, 200, bl.text);

  // Re-patching must update, not duplicate
  const again = await call('PATCH', '/api/upload/doctor/medical-profile', { token: S.doc.token, body: { patientId: S.p1, age: 55 } });
  assert.equal(again.status, 200);

  for (const [who, token] of [['doctor', S.doc.token], ['patient (self)', S.pat.token]]) {
    const r = await call('POST', '/api/upload/medical-profile', { token, body: { patientId: S.p1 } });
    assert.equal(r.status, 200, who);
    const p = r.json.profile;
    // PatientProfile.fromJson types
    assert.equal(p.age, 55);
    assert.equal(p.patientId, S.p1);
    for (const k of ['gender', 'bloodGroup', 'dialysisType', 'height', 'weight', 'primaryDiagnosis', 'nativeKidneyDisease', 'address', 'contactNumber', 'crNumber', 'educationLevel', 'incomeLevel']) {
      assert.equal(typeof p[k], 'string', k);
    }
    assert.deepEqual(p.allergies, ['Penicillin', 'Dust']);
    assert.deepEqual(p.comorbidities, []);
    assert.equal(p.emergencyContact.relation, 'Son');
    // CompletePatientDetails
    const b = r.json.baselineAssessment;
    assert.equal(b.pdCatheterInsertionDate, '2026-01-05');
    assert.equal(b.trainingStartDate, null);
    assert.equal(b.pdPrescription[0].fillVolume, 2000);
    assert.equal(b.labs.creatinine.value, 8);
    assert.equal(b._id, undefined);
  }
  assert.equal(await mongoose.model('MedicalProfile').countDocuments({ patient: S.p1 }), 1);

  // Access control: other doctor and other patient are refused
  assert.equal((await call('POST', '/api/upload/medical-profile', { token: S.doc2.token, body: { patientId: S.p1 } })).status, 403);
  const pl2 = await call('POST', '/api/auth/login', { body: { email: 'patient2@example.com', password: 'secret2' } });
  assert.equal((await call('POST', '/api/upload/medical-profile', { token: pl2.json.token, body: { patientId: S.p1 } })).status, 403);
  assert.equal((await call('PATCH', '/api/upload/doctor/medical-profile', { token: S.doc2.token, body: { patientId: S.p1, age: 1 } })).status, 403);

  // Patient with no profile yet: 200 with blank profile (screens render blanks, not an error)
  const blank = await call('POST', '/api/upload/medical-profile', { token: S.doc2.token, body: { patientId: S.p2 } });
  assert.equal(blank.status, 200);
  assert.equal(blank.json.profile.age, 0);
  assert.equal(blank.json.baselineAssessment, null);
});

test('doctor issues a PD kit and attaches a photo', async () => {
  const r = await call('POST', '/api/upload/start-material-session', {
    token: S.doc.token,
    body: {
      patientId: S.p1, sessionsCount: 2,
      // real key names used by create_active_material_screen.dart; the dotted/$ keys must be dropped, not crash
      pdMaterials: { transferSet: 2, capd: { fluid1_5_2L: 4, fluid2_5_2L: 2, 'bad.key': 9, $where: 1 }, apd: { fluid1_7_1L: 0 }, icodextrin2L: 1, minicap: 6, others: { description: 'Gloves', quantity: 10 } },
      notes: 'Handle with care',
    },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.success, true);
  S.kit = r.json.session._id;
  assert.match(S.kit, /^[a-f\d]{24}$/);

  assert.equal((await call('POST', '/api/upload/start-material-session', { token: S.doc.token, body: { patientId: S.p1, sessionsCount: 0, pdMaterials: {} } })).status, 400);
  assert.equal((await call('POST', '/api/upload/start-material-session', { token: S.doc2.token, body: { patientId: S.p1, sessionsCount: 1, pdMaterials: {} } })).status, 403);
  assert.equal((await call('POST', '/api/upload/start-material-session', { token: S.pat.token, body: { patientId: S.p1, sessionsCount: 1, pdMaterials: {} } })).status, 403);

  const up = await upload(S.doc.token, S.kit, PNG);
  assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.ok(up.json.image.imageUrl.startsWith(base + '/api/images/'));

  // Image URL works with no Authorization header (Image.network) and returns the bytes
  const img = await fetch(up.json.image.imageUrl, { headers: { Authorization: `Bearer ${S.doc.token}` } });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);

  const notImage = await upload(S.doc.token, S.kit, Buffer.from('<html>not an image at all</html>'), 'evil.png');
  assert.equal(notImage.status, 400);
  const byPatient = await upload(S.pat.token, S.kit, PNG);
  assert.equal(byPatient.status, 403);
});

test('patient: summary parses into the Flutter MaterialSession shape; must acknowledge first', async () => {
  const r = await call('POST', '/api/upload/patient/material-summary', { token: S.pat.token, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.deepEqual(Object.keys(r.json.patient).sort(), ['email', 'id', 'name']);
  const ms = r.json.materialSessions[0];
  assert.equal(ms.materialSessionId, S.kit);
  assert.equal(ms.status, 'active');
  assert.equal(ms.totalSessionsAllowed, 2);
  assert.equal(ms.completedSessions, 0);
  assert.equal(ms.remainingSessions, 2);
  assert.equal(ms.materials.sessionsCount, 2);
  assert.equal(ms.materials.pdMaterials.transferSet, 2);
  assert.deepEqual(ms.materials.pdMaterials.capd, { fluid1_5_2L: 4, fluid2_5_2L: 2 });
  assert.deepEqual(ms.materials.pdMaterials.others, { description: 'Gloves', quantity: 10 });
  assert.equal(ms.materialImages.length, 1);
  assert.ok(ms.materialImages[0].imageUrl && ms.materialImages[0].id && ms.materialImages[0].uploadedAt);
  assert.deepEqual(ms.dialysisSessions, []);

  // Cannot start before acknowledging
  const early = await call('POST', '/api/upload/start-dialysis-session', { token: S.pat.token, body: { materialSessionId: S.kit } });
  assert.equal(early.status, 409);

  // Doctor can't acknowledge on the patient's behalf; patient can
  assert.equal((await call('PATCH', '/api/upload/acknowledge-material-session', { token: S.doc.token, body: { sessionId: S.kit } })).status, 403);
  const ack = await call('PATCH', '/api/upload/acknowledge-material-session', { token: S.pat.token, body: { sessionId: S.kit } });
  assert.equal(ack.status, 200);
  const again = await call('PATCH', '/api/upload/acknowledge-material-session', { token: S.pat.token, body: { sessionId: S.kit } });
  assert.equal(again.status, 200); // idempotent

  const det = await call('POST', '/api/upload/material/session-details', { token: S.pat.token, body: { materialSessionId: S.kit } });
  assert.equal(det.json.materialSession.status, 'acknowledged');
  assert.ok(det.json.materialSession.acknowledgedAt);
});

const symptoms = (over = {}) => ({
  sessionId: S.day1,
  symptoms: {
    wellbeing: 4, appetite: true, nausea: false, vomiting: false, abdominalDiscomfort: false, constipation: false, diarrhea: false,
    sleepQuality: 3, fatigue: false, ableToDoActivities: true, breathlessness: false, footSwelling: false, facialPuffiness: false,
    rapidWeightGain: false, bpMeasured: true, sbp: 125, dbp: 82, weightMeasured: true, weightKg: 70.0,
    painDuringFillDrain: false, slowDrain: false, catheterLeak: false, exitSiteIssue: false, effluentClarity: 'Clear',
    urinePassed: true, urineAmount: 'Normal', fluidOverloadFeeling: false, fever: false, chills: false,
    newAbdominalPain: false, suddenUnwell: false, comments: 'Felt fine',
  },
  readings: { fillVolume: 2000, drainVolume: 2100, fillTime: 10, drainTime: 20 },
  ...over,
});

test('dialysis day lifecycle: start (resumable) -> photo -> finish -> verify', async () => {
  const s1 = await call('POST', '/api/upload/start-dialysis-session', { token: S.pat.token, body: { materialSessionId: S.kit } });
  assert.equal(s1.status, 200);
  S.day1 = s1.json.session._id;
  const resumed = await call('POST', '/api/upload/start-dialysis-session', { token: S.pat.token, body: { materialSessionId: S.kit } });
  assert.equal(resumed.json.session._id, S.day1, 'second start must resume the active day, not create day 2');

  // concurrent double-tap
  const [a, b] = await Promise.all([1, 2].map(() => call('POST', '/api/upload/start-dialysis-session', { token: S.pat.token, body: { materialSessionId: S.kit } })));
  assert.equal(a.json.session._id, S.day1);
  assert.equal(b.json.session._id, S.day1);

  const photo = await upload(S.pat.token, S.day1, PNG, 'day1.png');
  assert.equal(photo.status, 200);

  // Mass-assignment attempt: extra keys must be ignored, status cannot be forced
  const fin = await call('PATCH', '/api/upload/finish-dialysis-session', {
    token: S.pat.token,
    body: symptoms({ status: 'verified', verificationNotes: 'self-approved', verifiedAt: new Date().toISOString() }),
  });
  assert.equal(fin.status, 200, fin.text);
  assert.equal((await call('PATCH', '/api/upload/finish-dialysis-session', { token: S.pat.token, body: symptoms() })).status, 409);
  assert.equal((await upload(S.pat.token, S.day1, PNG)).status, 409, 'no photos after completion');

  const sum = await call('POST', '/api/upload/patient/material-summary', { token: S.pat.token, body: {} });
  const ms = sum.json.materialSessions[0];
  assert.equal(ms.completedSessions, 1);
  assert.equal(ms.remainingSessions, 1);
  const ds = ms.dialysisSessions[0];
  assert.equal(ds.sessionId, S.day1);
  assert.equal(ds.status, 'completed');
  assert.equal(ds.verifiedAt, null);
  assert.equal(ds.verificationNotes, null);
  assert.equal(ds.parameters.voluntary.wellbeing, 4);
  assert.equal(ds.parameters.voluntary.comments, 'Felt fine');
  assert.equal(ds.parameters.voluntary.effluentClarity, 'Clear');
  assert.deepEqual(ds.parameters.readings, { fillVolume: 2000, drainVolume: 2100, fillTime: 10, drainTime: 20 });
  assert.equal(ds.images.length, 1);
  // Dart: `double? weightKg = j['weightKg']` throws if the JSON number is an int (70). Must be 70.0.
  assert.match(sum.text, /"weightKg":70\.0[,}]/);

  // Only the assigned doctor can verify; patient can't
  assert.equal((await call('PATCH', '/api/upload/verify-dialysis-session', { token: S.pat.token, body: { sessionId: S.day1, verificationNotes: 'x' } })).status, 403);
  assert.equal((await call('PATCH', '/api/upload/verify-dialysis-session', { token: S.doc2.token, body: { sessionId: S.day1, verificationNotes: 'x' } })).status, 403);
  const ver = await call('PATCH', '/api/upload/verify-dialysis-session', { token: S.doc.token, body: { sessionId: S.day1, verificationNotes: 'All good' } });
  assert.equal(ver.status, 200);
  assert.equal((await call('PATCH', '/api/upload/verify-dialysis-session', { token: S.doc.token, body: { sessionId: S.day1, verificationNotes: 'again' } })).status, 409);

  // Doctor view of the kit (patientId + materialSessionId)
  const det = await call('POST', '/api/upload/material/session-details', { token: S.doc.token, body: { patientId: S.p1, materialSessionId: S.kit } });
  assert.equal(det.status, 200);
  const d1 = det.json.materialSession.dialysisSessions[0];
  assert.equal(d1.status, 'verified');
  assert.equal(d1.verificationNotes, 'All good');
  assert.equal(d1.verifiedBy, 'Dr One');
  assert.ok(d1.verifiedAt);
  assert.equal(det.json.materialSession.completedSessions, 1);

  // Doctor summary for the patient
  const dsum = await call('POST', '/api/upload/patient/material-summary', { token: S.doc.token, body: { patientId: S.p1 } });
  assert.equal(dsum.json.patient.id, S.p1);
  assert.equal((await call('POST', '/api/upload/patient/material-summary', { token: S.doc2.token, body: { patientId: S.p1 } })).status, 403);
  assert.equal((await call('POST', '/api/upload/patient/material-summary', { token: S.pat.token, body: { patientId: S.p2 } })).status, 403);
  assert.equal((await call('POST', '/api/upload/material/session-details', { token: S.doc2.token, body: { materialSessionId: S.kit } })).status, 403);
});

test('kit runs out after sessionsCount days; validation errors are 400 with a message', async () => {
  const s2 = await call('POST', '/api/upload/start-dialysis-session', { token: S.pat.token, body: { materialSessionId: S.kit } });
  assert.equal(s2.status, 200);
  assert.notEqual(s2.json.session._id, S.day1);
  assert.equal(s2.json.session.sequence, 2);
  const fin = await call('PATCH', '/api/upload/finish-dialysis-session', {
    token: S.pat.token,
    body: { sessionId: s2.json.session._id, symptoms: { wellbeing: 2, comments: 'ok' } }, // no readings (optional in the app)
  });
  assert.equal(fin.status, 200);

  const third = await call('POST', '/api/upload/start-dialysis-session', { token: S.pat.token, body: { materialSessionId: S.kit } });
  assert.equal(third.status, 409);
  assert.equal(typeof third.json.message, 'string');

  const sum = await call('POST', '/api/upload/patient/material-summary', { token: S.pat.token, body: {} });
  const ms = sum.json.materialSessions[0];
  assert.equal(ms.remainingSessions, 0);
  assert.equal(ms.dialysisSessions[1].parameters.readings, null);

  const bad = await call('PATCH', '/api/upload/finish-dialysis-session', { token: S.pat.token, body: { sessionId: 'nope' } });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/api/upload/material/session-details', { token: S.pat.token, body: { materialSessionId: 'x' } })).status, 400);
  assert.equal((await call('POST', '/api/upload/patient/material-summary', { body: {} })).status, 401);
  assert.equal((await call('POST', '/api/upload/patient/material-summary', { token: 'garbage', body: {} })).status, 401);
  assert.equal((await call('GET', '/api/nope')).status, 404);
});

test('phase 9 security boundaries: protected notifications, platform controls, and scoped overview', async () => {
  assert.equal((await call('GET', '/api/notifications')).status, 401);
  assert.equal((await call('PATCH', '/api/notifications/not-an-id/read', { token: S.pat.token })).status, 400);
  assert.equal((await call('GET', '/api/hospitals/platform/overview', { token: S.doc.token })).status, 403);
  assert.equal((await call('PATCH', '/api/hospitals/not-an-id/status', { token: S.doc.token, body: { status: 'suspended' } })).status, 403);
  assert.equal((await call('GET', '/api/hospitals/not-an-id/overview', { token: S.pat.token })).status, 403);
  assert.equal((await call('GET', '/api/audit-events')).status, 401);
});

test('hospital phase 2: register, view, and update a complete patient record', async () => {
  const admin = await User.create({ name: 'Hospital Admin', email: 'hospital-admin@example.com', passwordHash: await User.hashPassword('hospitalpass'), role: 'hospital_admin' });
  const hospital = await Hospital.create({ name: 'Phase Hospital', code: 'PHASE-H1', createdBy: S.doc.user.id });
  await HospitalMembership.create({ hospital: hospital._id, user: admin._id, role: 'hospital_admin' });
  await HospitalMembership.create({ hospital: hospital._id, user: S.doc.user.id, role: 'doctor' });
  const login = await call('POST', '/api/auth/login', { body: { email: admin.email, password: 'hospitalpass' } });
  const created = await call('POST', `/api/hospitals/${hospital._id}/patients`, { token: login.json.token, body: { name: 'Hospital Patient', phone: '9000000000', primaryDoctor: S.doc.user.id, primaryDiagnosis: 'CKD stage 5', dialysisType: 'CAPD', emergencyContact: { name: 'Caregiver', phone: '9111111111', relation: 'Spouse' } } });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.json.relationship.patient.name, 'Hospital Patient');
  assert.match(created.json.relationship.mrn, /^PHASE-H1-/);
  assert.equal(created.json.relationship.primaryDoctor.name, 'Dr One');
  const history = await call('GET', `/api/patients/${created.json.patient.id}/history?hospitalId=${hospital._id}`, { token: login.json.token });
  assert.equal(history.status, 200, history.text);
  assert.equal(history.json.scope, 'detailed');
  assert.equal(history.json.relationship.primaryDoctor.name, 'Dr One');
  assert.equal(history.json.profile.primaryDiagnosis, 'CKD stage 5');
  const update = await call('PATCH', `/api/hospitals/${hospital._id}/patients/${created.json.patient.id}`, { token: login.json.token, body: { name: 'Updated Hospital Patient', bloodGroup: 'O+', allergies: ['Penicillin'] } });
  assert.equal(update.status, 200, update.text);
  assert.equal(update.json.patient.name, 'Updated Hospital Patient');
  assert.deepEqual(update.json.profile.allergies, ['Penicillin']);
  const operations = await call('GET', `/api/hospitals/${hospital._id}/operations`, { token: login.json.token });
  assert.equal(operations.status, 200, operations.text);
  assert.equal(operations.json.operations.metrics.activePatients, 1);
  assert.equal(operations.json.operations.metrics.unassignedPatients, 0);
});

test('hospital phase 5: role boundaries, assignment, invitation, and hospital isolation', async () => {
  const [adminOne, adminTwo, doctor] = await Promise.all([
    User.create({ name: 'Admin One', email: 'admin-one@example.com', passwordHash: await User.hashPassword('adminpass1'), role: 'hospital_admin' }),
    User.create({ name: 'Admin Two', email: 'admin-two@example.com', passwordHash: await User.hashPassword('adminpass2'), role: 'hospital_admin' }),
    User.create({ name: 'Assigned Doctor', email: 'assigned-doctor@example.com', passwordHash: await User.hashPassword('doctorpass3'), role: 'doctor' }),
  ]);
  const [hospitalOne, hospitalTwo] = await Promise.all([
    Hospital.create({ name: 'Isolation One', code: 'ISO-ONE', createdBy: S.doc.user.id }),
    Hospital.create({ name: 'Isolation Two', code: 'ISO-TWO', createdBy: S.doc.user.id }),
  ]);
  await HospitalMembership.insertMany([
    { hospital: hospitalOne._id, user: adminOne._id, role: 'hospital_admin' },
    { hospital: hospitalTwo._id, user: adminTwo._id, role: 'hospital_admin' },
    { hospital: hospitalOne._id, user: doctor._id, role: 'doctor' },
  ]);
  const adminLogin = await call('POST', '/api/auth/login', { body: { email: adminOne.email, password: 'adminpass1' } });
  const patient = await call('POST', `/api/hospitals/${hospitalOne._id}/patients`, { token: adminLogin.json.token, body: { name: 'Isolated Patient', primaryDoctor: doctor._id } });
  assert.equal(patient.status, 201, patient.text);
  assert.equal((await call('GET', `/api/hospitals/${hospitalOne._id}/patient-relationships`, { token: adminLogin.json.token })).json.relationships.length, 1);
  assert.equal((await call('GET', `/api/hospitals/${hospitalTwo._id}/operations`, { token: adminLogin.json.token })).status, 403);
  assert.equal((await call('GET', `/api/hospitals/${hospitalTwo._id}/memberships`, { token: adminLogin.json.token })).status, 403);
  assert.equal((await call('PATCH', `/api/hospitals/${hospitalOne._id}/configuration`, { token: adminLogin.json.token, body: { name: 'Isolation One Updated' } })).status, 200);
  assert.equal((await call('GET', `/api/hospitals/patients/${patient.json.patient.id}/relationships`, { token: adminLogin.json.token })).status, 400);
  assert.equal((await call('GET', `/api/hospitals/patients/${patient.json.patient.id}/relationships?hospitalId=${hospitalTwo._id}`, { token: adminLogin.json.token })).status, 403);
  assert.equal((await call('POST', '/api/consent', { token: adminLogin.json.token, body: { patientId: patient.json.patient.id, hospitalId: hospitalOne._id, scope: 'detailed' } })).status, 201);
  const adminTwoLogin = await call('POST', '/api/auth/login', { body: { email: adminTwo.email, password: 'adminpass2' } });
  const foreignConsents = await call('GET', `/api/consent/patient/${patient.json.patient.id}`, { token: adminTwoLogin.json.token });
  assert.equal(foreignConsents.status, 200);
  assert.equal(foreignConsents.json.consents.length, 0);
  const invite = await call('POST', `/api/hospitals/${hospitalOne._id}/invitations`, { token: adminLogin.json.token, body: { name: 'Hospital Nurse', email: 'nurse-isolation@example.com', role: 'nurse' } });
  assert.equal(invite.status, 201, invite.text);
  assert.ok(invite.json.token);
  const registeredWithEmail = await call('POST', `/api/hospitals/${hospitalOne._id}/patients`, { token: adminLogin.json.token, body: { name: 'Portal Patient', email: 'portal-patient@example.com' } });
  assert.equal(registeredWithEmail.status, 201, registeredWithEmail.text);
  assert.ok(registeredWithEmail.json.invitationToken);
  const activated = await call('POST', '/api/hospitals/invitations/accept', { body: { token: registeredWithEmail.json.invitationToken, password: 'portalpatientpass' } });
  assert.equal(activated.status, 201, activated.text);
  assert.equal(activated.json.user.email, 'portal-patient@example.com');
  const h2Patient = await call('POST', `/api/hospitals/${hospitalTwo._id}/patients`, { token: adminLogin.json.token, body: { name: 'Should Not Create' } });
  assert.equal(h2Patient.status, 403);
});
