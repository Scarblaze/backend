# Digital Dialysis — backend

Express + MongoDB (Mongoose), ES modules, deployable to Vercel. Built from what the Flutter app
actually calls (`lib/**/*.dart`), not from a spec: every route, request body and response shape
below is the one the app's controllers and models expect.

## Layout
```
api/index.js            Vercel entry (exports the Express app)
app.js                  Express app (routes, CORS, error handling)
server.js               local dev entry
config/db.js            cached Mongo connection for serverless
middleware/             auth (JWT + roles), upload (multer), error handler
models/                 User, MedicalProfile, BaselineAssessment, MaterialSession, DialysisSession, ImageAsset
routes/                 auth.js, upload.js (all /api/upload/*), images.js
services/               access control, image storage, response formatters
scripts/seed.js         create the first doctor/admin
test/api.test.js        end-to-end test replaying the app's requests
```

## Endpoints (all JSON, `Authorization: Bearer <token>` except login and image URLs)
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | any | `{email,password}` → `{token,user:{id,name,email,role}}` |
| POST | `/api/auth/register` | doctor/admin | register a patient (assigned to the calling doctor) → `{success,userId}` |
| POST | `/api/upload/doctor/patients` | doctor | `{doctorId}` → `{patients:[{_id,name,email}]}` |
| PATCH | `/api/upload/doctor/medical-profile` | doctor | create/update profile |
| PATCH | `/api/upload/doctor/baseline-assessment` | doctor | create/update baseline |
| POST | `/api/upload/medical-profile` | doctor / that patient | `{patientId}` → `{profile, medicalProfile, baselineAssessment}` |
| POST | `/api/upload/start-material-session` | doctor | issue a PD kit |
| POST | `/api/upload/patient/material-summary` | doctor / patient | `{patientId?}` → patient + all kits with their days |
| POST | `/api/upload/material/session-details` | doctor / patient | `{materialSessionId, patientId?}` |
| PATCH | `/api/upload/acknowledge-material-session` | patient | `{sessionId}` |
| POST | `/api/upload/start-dialysis-session` | patient | `{materialSessionId}` → `{session:{_id}}` (resumes an unfinished day) |
| PATCH | `/api/upload/finish-dialysis-session` | patient | `{sessionId, symptoms, readings?}` |
| PATCH | `/api/upload/verify-dialysis-session` | doctor | `{sessionId, verificationNotes}` |
| POST | `/api/upload/upload` | doctor (kit) / patient (own active day) | multipart: `image`, `sessionId` |
| GET | `/api/images/:token` | public (unguessable) | photo bytes (when stored in MongoDB) |

Lifecycle: kit `active` → patient acknowledges → `acknowledged`; each day `active` → `completed` → `verified`.
A doctor only ever sees their own patients; a patient only their own records.

## Deploy
1. **MongoDB Atlas**: free M0 cluster → Database Access: create a user → Network Access: allow `0.0.0.0/0`
   (Vercel has no fixed IPs) → copy the connection string.
2. **Vercel**: import this folder (or run `npx vercel`). Project → Settings → Environment Variables:
   - `MONGODB_URI` — the Atlas string (include the database name, e.g. `/digital_dialysis`)
   - `JWT_SECRET` — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - optional: `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
   Then `npx vercel --prod`.
3. **Create the first doctor** (no default password ships in the code). From this folder, with the same
   `MONGODB_URI` in a local `.env`:
   ```
   SEED_EMAIL=doctor1@example.com SEED_PASSWORD='choose-a-strong-one' npm run seed
   ```
   Re-running resets that account's password.
4. **Point the app at it** (the app's built-in default URL is the dead one):
   ```
   flutter run --dart-define=BASE_URL=https://<your-project>.vercel.app
   flutter build apk --dart-define=BASE_URL=https://<your-project>.vercel.app
   ```
   No trailing slash. Check `https://<your-project>.vercel.app/api/health` shows `"db":"connected"`.

## Local run & tests
```
cp .env.example .env     # fill MONGODB_URI and JWT_SECRET
npm install
npm run dev
MONGODB_URI=mongodb://127.0.0.1:27017/dialysis_test npm test   # WIPES that database — use a scratch one
```

## Notes
- **Photo size on Vercel**: serverless request bodies are capped at ~4.5 MB. The doctor's kit picker already
  uses `imageQuality: 80`; the patient's day photo picker (`day_dailysis_screen.dart`, `pickImage`) does not.
  Add `imageQuality: 70, maxWidth: 1600` there or large phone photos will be rejected by Vercel before they
  reach this code.
- **Image storage**: without Cloudinary variables, photos are stored inside MongoDB (fine for a pilot; Atlas M0
  has 512 MB). Set the Cloudinary variables to move new uploads there; nothing else changes.
- **`weightKg`**: the app declares it `double?`, and Dart crashes decoding `70` into it, so the API always
  writes whole numbers as `70.0` (see `utils/json.js`).
