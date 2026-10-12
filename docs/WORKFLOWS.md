# Core workflows

## Hospital creation

1. Platform admin submits a hospital name and optional code.
2. The backend normalizes the supplied code or derives one from the hospital name.
3. Duplicate codes receive a numeric fallback suffix.
4. The hospital is created as active and audited.

## Staff onboarding

1. Hospital admin creates an invitation for a supported role.
2. The token is stored only as a hash and expires after the configured period.
3. The invitee opens the activation flow and sets a password.
4. The backend creates or activates the user, creates the hospital membership, and audits acceptance.
5. Staff access remains subject to membership status and hospital status.

## Patient registration

1. Hospital admin creates a patient record.
2. The backend generates or validates a hospital-specific MRN.
3. A patient user, hospital membership, patient-hospital relationship, and medical profile are created.
4. Optional primary doctor, assistant doctors, and care-team members are validated against the same hospital.
5. If an email is provided, a one-time activation token is returned for secure delivery.

## Assignment

The hospital admin selects one primary doctor, zero or more assistant doctors, and zero or more care-team members. Every selected user must have the correct role and an active membership in the same hospital. Doctors and assistants see only their assigned patient relationships.

## PD clinical lifecycle

```text
Material session issued
        -> patient acknowledges
        -> dialysis day starts/resumes
        -> patient records readings and symptoms
        -> day completed
        -> doctor verifies
```

The portal is PD-only. CAPD/APD terminology and treatment-plan fields require clinician confirmation before production use.

## Consent and detailed history

Hospital staff access is bounded by hospital relationship and role. Cross-hospital or consent-based detailed visibility must use the consent and patient-access services. A patient may review their own permitted relationships and records.

## Transfer

1. Source hospital requests transfer to an active destination hospital.
2. Source hospital admin approves source transfer.
3. Destination hospital admin approves destination transfer.
4. The patient relationship is created or activated in the destination hospital with its destination MRN.
5. Transfer completion and related actions are audited and notified.

## Break-glass

1. Authorized staff provide a clinical reason.
2. Access is time-limited and recorded.
3. The access can be reviewed by hospital governance users.
4. Expired access must not continue to grant visibility.
