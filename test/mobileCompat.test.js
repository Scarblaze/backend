// Guards the two things the Flutter app depends on that the web-portal work could break:
//   1. Photo URLs in API responses must load with a plain GET (Image.network cannot send headers).
//   2. App logins get long-lived tokens; browser logins stay short-lived.
// Uses its own database so it can run in parallel with api.test.js.
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret';
process.env.CLOUDINARY_URL = '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.CORS_ORIGIN = 'https://portal.example.org'; // the branch only allows listed browser origins
delete process.env.JWT_EXPIRES_IN;
delete process.env.JWT_MOBILE_EXPIRES_IN;
const configuredMongoUri = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI;
if (!configuredMongoUri) throw new Error('MONGODB_URI or MONGODB_TEST_URI must be set for integration tests');
const testMongoUri = new URL(configuredMongoUri);
testMongoUri.pathname = '/dialysis_test_compat';
process.env.MONGODB_URI = testMongoUri.toString();

const { default: app } = await import('../app.js');
const { default: connectDB } = await import('../config/db.js');
const { User } = await import('../models/User.js');
const { signedImageUrl, verifyImageLink } = await import('../services/imageLinks.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const BROWSER = { Origin: 'https://portal.example.org' };
const DAY = 24 * 60 * 60;

let server, base;
const S = {};

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, res };
}

const lifetime = (jwtToken) => {
  const p = JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64url').toString());
  return { seconds: p.exp - p.iat, client: p.client };
};
const login = (email, password, headers) => call('POST', '/api/auth/login', { body: { email, password }, headers });

before(async () => {
  await connectDB();
  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  await Promise.all(collections.map(({ name }) => mongoose.connection.db.collection(name).deleteMany({})));
  await User.syncIndexes();
  const mk = async (name, email, role, extra = {}) =>
    User.create({ name, email, passwordHash: await User.hashPassword('password1'), role, ...extra });
  S.docA = await mk('Dr A', 'a@example.com', 'doctor');
  S.docB = await mk('Dr B', 'b@example.com', 'doctor');
  S.pat = await mk('Pat', 'p@example.com', 'patient', { assignedDoctor: S.docA._id });
  await mk('Hosp Admin', 'admin@example.com', 'hospital_admin');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

test('token lifetime: app logins are long, browser logins short, portal-only roles always short', async () => {
  const app1 = lifetime((await login('a@example.com', 'password1')).json.token);
  assert.equal(app1.seconds, 30 * DAY);
  assert.equal(app1.client, 'app');

  const patient = lifetime((await login('p@example.com', 'password1')).json.token);
  assert.equal(patient.seconds, 30 * DAY);

  const web = lifetime((await login('a@example.com', 'password1', BROWSER)).json.token);
  assert.equal(web.seconds, 12 * 3600);
  assert.equal(web.client, 'web');

  // A portal-only role gets the short lifetime even without an Origin header (curl, scripts)
  const staff = lifetime((await login('admin@example.com', 'password1')).json.token);
  assert.equal(staff.seconds, 12 * 3600);
});

test('token lifetime can be tuned with env vars', async () => {
  process.env.JWT_EXPIRES_IN = '2h';
  process.env.JWT_MOBILE_EXPIRES_IN = '7d';
  try {
    assert.equal(lifetime((await login('a@example.com', 'password1')).json.token).seconds, 7 * DAY);
    assert.equal(lifetime((await login('a@example.com', 'password1', BROWSER)).json.token).seconds, 2 * 3600);
  } finally {
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_MOBILE_EXPIRES_IN;
  }
});

test('signed image links: work without login, tamper/expiry refused, bare URL still protected', async () => {
  S.docToken = (await login('a@example.com', 'password1')).json.token;
  S.docBToken = (await login('b@example.com', 'password1')).json.token;
  S.patToken = (await login('p@example.com', 'password1')).json.token;

  const kit = await call('POST', '/api/upload/start-material-session', {
    token: S.docToken,
    body: { patientId: String(S.pat._id), sessionsCount: 2, pdMaterials: { transferSet: 1 } },
  });
  assert.equal(kit.status, 200, kit.text);
  S.kit = kit.json.session._id;

  const form = new FormData();
  form.append('sessionId', S.kit);
  form.append('image', new Blob([PNG], { type: 'application/octet-stream' }), 'kit.png'); // Dart sends octet-stream
  const up = await fetch(`${base}/api/upload/upload`, { method: 'POST', headers: { Authorization: `Bearer ${S.docToken}` }, body: form });
  assert.equal(up.status, 200);
  const uploaded = (await up.json()).image.imageUrl;
  assert.match(uploaded, /\/api\/images\/[a-f\d]{48}\?exp=\d+&sig=[\w-]+$/);

  // The app reads the URL out of material-summary and hands it straight to Image.network: plain GET, no headers
  const sum = await call('POST', '/api/upload/patient/material-summary', { token: S.patToken, body: {} });
  const url = sum.json.materialSessions[0].materialImages[0].imageUrl;
  const plain = await fetch(url);
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await plain.arrayBuffer()), PNG);
  S.url = url;

  // Same URL across refreshes within the hour (keeps Flutter's image cache effective)
  const again = await call('POST', '/api/upload/patient/material-summary', { token: S.patToken, body: {} });
  const url2 = again.json.materialSessions[0].materialImages[0].imageUrl;
  if (url2 !== url) { // only possible if the clock crossed an hour boundary between the two calls
    const third = await call('POST', '/api/upload/patient/material-summary', { token: S.patToken, body: {} });
    assert.equal(third.json.materialSessions[0].materialImages[0].imageUrl, url2);
  }

  // Tampering with signature, expiry or token is refused (403), never falls through to anything else
  const u = new URL(url);
  const bad = (mutate) => { const c = new URL(url); mutate(c); return fetch(c.toString()); };
  assert.equal((await bad((c) => c.searchParams.set('sig', u.searchParams.get('sig').slice(1) + 'x'))).status, 403);
  assert.equal((await bad((c) => c.searchParams.set('exp', String(Number(u.searchParams.get('exp')) + 3600)))).status, 403);
  assert.equal((await bad((c) => c.searchParams.set('exp', 'abc'))).status, 403);
  assert.equal((await bad((c) => c.searchParams.delete('sig'))).status, 403);
  assert.equal((await fetch(`${base}/api/images/${'0'.repeat(48)}${u.search}`)).status, 403);
  // A bad signature plus a valid Bearer token is still refused: the signature path does not fall back
  assert.equal((await fetch(url.replace(/sig=[^&]+/, 'sig=nope'), { headers: { Authorization: `Bearer ${S.docToken}` } })).status, 403);

  // Bare URL (no signature): needs a login and the normal patient-access check
  const bare = `${u.origin}${u.pathname}`;
  assert.equal((await fetch(bare)).status, 401);
  assert.equal((await fetch(bare, { headers: { Authorization: `Bearer ${S.docToken}` } })).status, 200); // assigned doctor
  assert.equal((await fetch(bare, { headers: { Authorization: `Bearer ${S.patToken}` } })).status, 200); // the patient
  assert.equal((await fetch(bare, { headers: { Authorization: `Bearer ${S.docBToken}` } })).status, 403); // someone else's doctor
});

test('signature expiry is enforced', () => {
  const token = 'a'.repeat(48);
  const url = new URL(signedImageUrl('http://x', token, 1_000_000_000_000));
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  const expMs = Number(exp) * 1000;
  assert.equal(verifyImageLink(token, exp, sig, expMs - 1000), true);
  assert.equal(verifyImageLink(token, exp, sig, expMs + 2000), false);
  assert.equal(verifyImageLink(token, exp, sig, 1_000_000_000_000), true);
  // default lifetime is 24h (+ up to 1h of rounding)
  const lifeSec = Number(exp) - 1_000_000_000;
  assert.ok(lifeSec >= DAY && lifeSec <= DAY + 3600, `lifetime was ${lifeSec}s`);
  // a signature for one token never validates another
  assert.equal(verifyImageLink('b'.repeat(48), exp, sig, 1_000_000_000_000), false);
});
