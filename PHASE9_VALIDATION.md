# Phase 9 — Testing and Clinical Validation

## Automated validation completed

| Area | Result |
|---|---|
| Authentication and role boundaries | Passed |
| PD onboarding and session lifecycle | Passed |
| Image upload and verification permissions | Passed |
| Mass-assignment/input validation | Passed |
| Notification authorization | Passed |
| Platform-admin authorization | Passed |
| Hospital-scoped overview access | Passed |
| Frontend role routing and permissions audit | Passed |
| Frontend production build | Passed |
| Staging health/statistics/worklist smoke test | Passed |
| Clinical scope audit | Passed — zero unscoped clinical records |

The backend suite currently contains 11 integration/security tests. The frontend audit checks the active TypeScript entrypoint, role routing, baseline permissions, and notification center. The staging smoke test logs in as the seeded platform admin and doctor, then verifies health, platform statistics, hospital overview, doctor worklist, and notifications. A rerun requires reachable MongoDB Atlas or a local test database.

## Clinical review checklist

These items require human validation with PD clinicians and hospital staff; they cannot be safely certified by automated tests alone:

- Confirm CAPD terminology, prescription fields, and verification workflow with a PD clinician.
- Confirm role boundaries for hospital admin, doctor, assistant doctor, nurse, and records officer.
- Confirm that summary versus detailed historical visibility matches hospital policy and consent policy.
- Confirm break-glass reason capture, visibility, expiry, and audit expectations.
- Confirm transfer approval sequence and destination onboarding workflow.
- Confirm dashboard wording, queue priority, risk-alert wording, and notification action expectations.
- Run usability sessions with representative hospital staff on desktop and mobile layouts.
- Record clinician sign-off, issues, severity, owner, and resolution before pilot deployment.

## Phase 9 conclusion

Automated and staging validation is complete. Human clinical review and usability sign-off remain a required release gate before Phase 10 production deployment.
