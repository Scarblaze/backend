# Digital Dialysis Portal — Phase Status

## Completed

### Phase 1 — Foundation

Authentication, user roles, MongoDB/Mongoose persistence, Vercel-compatible Express deployment, and the TypeScript frontend foundation.

### Phase 2 — Hospital and patient administration

Hospitals, memberships, invitations, patient-hospital relationships, hospital-specific MRNs, consent, break-glass access, audit events, and staff management.

### Phase 3 — PD clinical workflow

PD-only material sessions, dialysis-day lifecycle, readings, verification, baseline assessments, medical profiles, versioned treatment plans, and patient transfers.

### Phase 4 — Role dashboards

Separate platform-admin, hospital-admin, and doctor workspaces with role-aware navigation and protected backend routes.

### Phase 5 — Workflow integration

Transfer requests and approvals, treatment-plan history, notifications, consent workflows, audit history, patient history, and frontend clinical record views.

### Phase 6 — Security and hospital isolation

Hospital-scoped clinical records, compound indexes, role alignment, transactional transfer completion, legacy-record migration, scope auditing, and Atlas index repair.

### Phase 7 — Operational dashboards

Live overview metrics, notification center, unread/read notification state, platform hospital creation, hospital activation/suspension, lifecycle audit events, and hospital-admin operational notifications.

## Remaining work

### Phase 8 — Complete role dashboards and notifications — functionally complete

The core Phase 8 scope is implemented across the backend and frontend. Some dashboard areas remain intentionally lightweight and are documented as follow-up polish in Phase 9.

Platform admin:

- Create hospitals — implemented.
- Suspend/reactivate hospitals — implemented.
- Manage hospital admins — membership status API and staff-management UI implemented.
- Cross-hospital audit — backend capability exists; dashboard integration pending.
- System-health overview — health API and platform dashboard display implemented.
- Platform-wide statistics — overview API and dashboard statistics implemented.

Hospital admin:

- Invite and deactivate staff — invitation, membership status API, and staff UI implemented.
- Assign doctors and assistant doctors — assignment API and hospital staff UI implemented.
- Invite patients — implemented.
- Review transfers — implemented.
- Review break-glass access — hospital review API and dashboard review UI implemented.
- Hospital audit page — implemented for the clinical workspace.
- Hospital configuration — configuration API implemented; admin editing UI pending.

Doctor:

- Assigned-patient queue — assigned patient directory and worklist support implemented.
- Pending PD verification — backend verification and worklist support implemented.
- Follow-up queue — backend worklist support implemented; richer queue presentation remains polish.
- Treatment-plan alerts — version history exists; alert workflow pending.
- Patient risk indicators — backend risk detection implemented; richer UI pending.
- Assistant-doctor management — assignment and invitation support implemented; richer supervision workflow remains polish.

Shared:

- Notification center — implemented.
- Unread count — implemented.
- Mark as read — implemented.
- Action links — notification action target support implemented; full in-app routing remains polish.
- Recent activity timeline — basic audit page exists; dashboard timeline pending.

### Phase 9 — Testing and clinical validation — automated validation complete; human sign-off pending

- Hospital access tests.
- Role permission tests.
- Invitation tests.
- Consent tests.
- Break-glass tests.
- Transfer tests.
- Notification tests.
- Treatment-plan version tests.
- Multi-hospital isolation tests.
- Frontend component tests.
- End-to-end browser testing.
- PD clinician review.
- Usability testing with hospital staff.

Automated results and the clinician review gate are documented in `PHASE9_VALIDATION.md`.

### Phase 10 — Production deployment and operations

- Staging deployment.
- Vercel frontend deployment.
- Backend deployment configuration.
- MongoDB Atlas production database.
- Separate staging and production databases.
- Environment-variable management.
- Backups and restore drills.
- Monitoring.
- Error tracking.
- Structured logs.
- Rollback plan.
- Hospital onboarding documentation.
- Pilot deployment with one hospital.
- Gradual national rollout.

## Current validation

- Clinical scope audit: zero unscoped MedicalProfile, BaselineAssessment, or TreatmentPlanVersion records in staging.
- Backend regression suite: 11 integration/security tests; rerun requires reachable MongoDB Atlas or a local test database.
- Frontend production build: passing.
- Staging contains guarded demo hospital and PD workflow records.
