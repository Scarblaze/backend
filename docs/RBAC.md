# Roles and RBAC

## Roles

| Role | Intended scope |
|---|---|
| `platform_admin` / legacy `admin` | Platform-wide administration, hospital lifecycle, cross-hospital reporting, and system oversight. |
| `hospital_admin` | Administration of hospitals where the user has an active hospital membership. |
| `doctor` | Assigned PD patients in hospitals where the doctor has an active membership. |
| `assistant_doctor` | Patients explicitly assigned through `assistantDoctors`. |
| `nurse`, `dialysis_technician`, `pharmacist`, `records_officer` | Patients explicitly assigned through `careTeam`, subject to hospital policy. |
| `patient` | The patient’s own account and permitted own records. |

## Permission matrix

| Capability | Platform admin | Hospital admin | Doctor | Assistant / care staff | Patient |
|---|---:|---:|---:|---:|---:|
| View all hospitals | Yes | No | No | No | No |
| Create/suspend hospitals | Yes | No | No | No | No |
| View hospital directory | Yes | Own active hospitals | Own active hospitals | Own active hospitals | No |
| View all hospital patients | Yes | Yes | No | No | No |
| Register/edit hospital patient | No | Yes | No | No | No |
| Assign care team | Platform oversight | Yes | Limited clinical routes | No | No |
| View assigned patients | Yes | Yes | Primary patients | Explicitly assigned | Own only |
| Invite hospital staff | Oversight | Yes | No | No | No |
| Manage staff status | Oversight | Yes | No | No | No |
| Approve transfers | Platform oversight | Source/destination hospital admin | No | No | No |
| Review audit events | Platform-wide | Own hospital | Policy-limited | Policy-limited | No |
| Grant break-glass | Policy-dependent | Hospital policy | Clinical policy | Clinical policy | No |
| Verify PD sessions | Oversight | Hospital policy | Yes for assigned workflow | No | No |

## Important implementation rules

- A global role is not the same as a hospital membership; global administrators are the deliberate exception.
- Hospital staff require an active membership in the target hospital.
- Suspended hospitals reject ordinary staff access.
- Doctor assignment validates that the doctor is an active doctor member of that hospital.
- Assistant-doctor and care-team assignment validates every selected member against the target hospital.
- Patient relationship lookups must include `hospitalId` for staff requests.
- Platform admins are read/administration users, not hospital patient registration users; patient creation is restricted to `hospital_admin`.
- UI visibility is convenience only. Every permission must be enforced by the backend.

## Message discipline

Errors should describe the permitted action without exposing unrelated hospital or patient existence. Frontend messages must reflect the server response and must not claim that an operation succeeded before the API confirms it.
