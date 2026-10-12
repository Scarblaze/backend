# Testing and validation

## Automated checks

From the backend folder:

```powershell
npm test
npm run audit:clinical-scope
npm run audit:frontend
npm run smoke:phase9
```

From the frontend folder:

```powershell
npm run build
```

The integration suite requires a reachable MongoDB database. Use a disposable test database; the test setup may clear it.

## Required test areas

- Login success, invalid credentials, suspended accounts, and rate limiting.
- Role rejection for every protected route.
- Hospital membership and suspended-hospital rejection.
- Cross-hospital patient isolation.
- Doctor, assistant-doctor, and care-team assignment scope.
- Patient registration, MRN generation, invitation activation, and token reuse rejection.
- Consent grant/revoke and detailed-history visibility.
- Break-glass reason, expiry, review, and audit behavior.
- Transfer source/destination approval sequence.
- Notification recipient isolation and read state.
- Treatment-plan version ordering and hospital scope.
- Image authentication and patient authorization.
- Frontend role routing, actionable errors, and production build.

## Synthetic data

Use the guarded seed script only on staging:

```powershell
$env:SEED_DEMO_CONFIRM='YES'
$env:SEED_DEMO_PASSWORD='DemoPD-2026!'
npm run seed:demo
```

For larger datasets use `npm run seed:synthetic`. Remove them with `npm run cleanup:synthetic` only after verifying the target database. Always confirm `MONGODB_URI` before running either command.

## Clinical validation

Automated tests cannot certify clinical correctness. A PD clinician must review CAPD/APD terminology, prescription and baseline fields, risk wording, follow-up queues, consent behavior, break-glass policy, and transfer workflow. Hospital staff should test representative desktop and mobile journeys before pilot approval.

## Evidence to retain

Store the test date, environment, commit/deployment ID, database used, test result, failed cases, reviewer, clinical sign-off, and remediation owner.
