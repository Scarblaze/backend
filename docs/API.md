# API reference

Base URL: `/api`.

Protected endpoints require `Authorization: Bearer <token>`. JSON requests use `Content-Type: application/json`; uploads use `multipart/form-data`.

## Authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Login with email and password. |
| GET | `/auth/me` | Authenticated | Return current identity. |
| POST | `/auth/register` | Doctor/admin legacy flow | Create a legacy patient account. Prefer hospital invitations for the portal. |
| POST | `/hospitals/invitations/accept` | Public with one-time token | Activate an invited account and return a JWT. |

## Hospitals and patients

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/hospitals` | Platform admin | Create hospital; code is generated when omitted. |
| GET | `/hospitals` or `/hospitals/my` | Authenticated | List accessible hospitals. |
| PATCH | `/hospitals/:hospitalId/status` | Platform admin | Suspend/reactivate hospital. |
| PATCH | `/hospitals/:hospitalId/configuration` | Hospital admin/global admin | Update hospital identity details. |
| GET | `/hospitals/:hospitalId/overview` | Hospital staff | Hospital metrics scoped to access. |
| GET | `/hospitals/:hospitalId/operations` | Hospital admin/global admin | Operations queues and workload. |
| POST | `/hospitals/:hospitalId/patients` | Hospital admin | Register a patient. |
| PATCH | `/hospitals/:hospitalId/patients/:patientId` | Hospital admin | Update patient identity and clinical intake. |
| GET | `/hospitals/:hospitalId/patient-relationships` | Hospital staff | Return relationships scoped by role assignment. |
| PATCH | `/hospitals/:hospitalId/patient-relationships/:relationshipId/assignment` | Hospital admin/global admin | Update primary, assistant, and care-team assignment. |
| GET | `/hospitals/patients/:patientId/relationships` | Patient, assigned staff, global admin | Return authorized hospital relationships. Staff must provide `hospitalId`. |

## Staff, governance, and notifications

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET/POST | `/hospitals/:hospitalId/memberships` | Hospital admin/global admin | List/create memberships. |
| PATCH | `/hospitals/:hospitalId/memberships/:membershipId/status` | Hospital admin/global admin | Suspend/reactivate membership. |
| POST | `/hospitals/:hospitalId/invitations` | Hospital admin/doctor policy | Create staff or patient invitation. |
| GET | `/audit` and hospital audit routes | Policy-scoped | Review audit events. |
| GET/PATCH | `/notifications` | Recipient | List and mark notifications read. |
| GET/POST | `/consent/...` | Patient/authorized staff | Manage and review consent. |
| GET/POST | `/break-glass/...` | Authorized clinical/governance roles | Grant and review emergency access. |
| POST/PATCH | `/transfers/...` | Hospital admins | Create and approve transfer stages. |

## Legacy PD workflow

The existing `/upload` routes support patient profiles, baseline assessment, PD material sessions, dialysis-day lifecycle, verification, and image upload. These routes are retained for Flutter compatibility. New hospital functionality should use hospital-scoped records and the shared access services.

## Response convention

Successful responses generally contain `{ success: true, ... }`. Errors contain `{ success: false, message: string }`. Clients should display server messages only in the context of the attempted action and should not infer success from HTTP transport completion alone.
