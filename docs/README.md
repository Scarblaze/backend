# Digital Dialysis Portal Documentation

This directory is the detailed reference for the PD-only, multi-hospital portal.

## Documents

- [Architecture](ARCHITECTURE.md) — system boundaries, request flow, and deployment shape.
- [RBAC](RBAC.md) — roles, hospital scoping, patient scoping, and permission matrix.
- [API](API.md) — authenticated API conventions and route catalogue.
- [Data model](DATA_MODEL.md) — MongoDB collections and relationships.
- [Workflows](WORKFLOWS.md) — hospital onboarding, patient care, consent, transfer, and break-glass flows.
- [Security](SECURITY.md) — implemented controls, risks, and production hardening.
- [Deployment](DEPLOYMENT.md) — staging, Vercel, Atlas, environment variables, backups, and rollout.
- [Testing](TESTING.md) — automated tests, synthetic data, smoke checks, and clinical validation.
- [Frontend](FRONTEND.md) — application navigation, dashboards, and frontend/backend alignment.

## Scope

The product currently supports peritoneal dialysis (PD). Haemodialysis (HD), billing, pharmacy inventory, laboratory integration, and patient-facing clinical prescribing are outside the current scope.

## Release rule

The portal is intended for real clinical use, but automated tests are not a substitute for PD clinician review, hospital policy approval, privacy review, backup testing, and a controlled pilot.
