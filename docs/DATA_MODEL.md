# Data model

MongoDB uses collections rather than fixed SQL tables. Collections are created lazily when the first document is written.

## Identity and hospital collections

- `users` — identity, role, account status, password hash, legacy doctor links.
- `hospitals` — hospital name, generated/unique code, status, address, phone.
- `hospitalmemberships` — user-to-hospital role, status, hospital MRN, supervising doctor.
- `hospitalinvitations` — hashed one-time invitation token, target email, role, expiry, acceptance state.

## Patient and clinical collections

- `patienthospitalrelationships` — the primary hospital boundary for a patient; stores MRN, primary doctor, assistant doctors, care team, consent status, and relationship status.
- `medicalprofiles` — hospital-scoped demographics and clinical intake.
- `baselineassessments` — hospital-scoped PD baseline assessment and verification state.
- `treatmentplanversions` — immutable/versioned treatment plans scoped to patient and hospital.
- `materialsessions` — PD kit/material issue and day allowance.
- `dialysissessions` — PD day lifecycle, readings, symptoms, images, verification, and hospital reference.
- `imageassets` — image metadata and storage references; image retrieval is authorization-protected or requires a signed, expiring link.

## Governance collections

- `patientconsents` — patient consent grants/revocations for hospital or clinician access.
- `patienttransfers` — source/destination hospital transfer state machine.
- `breakglassaccesses` — emergency access reason, actor, expiry, and review state.
- `auditevents` — actor, hospital, action, resource, metadata, and timestamp.
- `notifications` — recipient, message, read state, action URL, and timestamp.

## Relationship rules

```text
User 1---N HospitalMembership N---1 Hospital
User(patient) 1---N PatientHospitalRelationship N---1 Hospital
PatientHospitalRelationship --- primaryDoctor (User)
PatientHospitalRelationship --- assistantDoctors (User[])
PatientHospitalRelationship --- careTeam (User[])
Patient + Hospital 1---N MedicalProfile / BaselineAssessment / TreatmentPlanVersion
Patient + Hospital 1---N DialysisSession / Transfer / Audit-related records
```

## Clinical-scope rule

`MedicalProfile`, `BaselineAssessment`, and `TreatmentPlanVersion` must always carry a hospital reference. Run `npm run audit:clinical-scope` after migrations and before release.

## Indexing and integrity

Use the compound indexes defined by the Mongoose models for patient/hospital and hospital/status access patterns. Run `npm run repair:clinical-indexes` after a migration if Atlas indexes are known to be stale. Prefer unique constraints for hospital codes, invitation token hashes, and relationship identity where defined.
