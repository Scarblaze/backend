# Architecture

## Overview

The system is a web portal backed by an Express API and MongoDB Atlas. The existing Flutter application also consumes the backend for the PD workflow. The hospital portal frontend is a separate TypeScript/Vite application.

```text
Browser / Flutter client
        |
        | HTTPS + JSON / multipart upload
        v
Vercel frontend       Vercel Express API
                              |
                              | Mongoose
                              v
                         MongoDB Atlas
                              |
                 optional Cloudinary image storage
```

## Backend layers

- `app.js` — Express application, CORS, security headers, route mounting, and error handling.
- `routes/` — HTTP endpoints and request-level authorization.
- `middleware/auth.js` — JWT creation, authentication, role checks.
- `middleware/hospitalAccess.js` — active hospital membership and hospital-status checks.
- `services/access.js` — clinical patient access and consent-aware visibility rules.
- `services/audit.js` and `services/notifications.js` — shared audit and notification behavior.
- `models/` — Mongoose schemas, indexes, and persistence constraints.
- `scripts/` — seeding, migration, audit, repair, cleanup, and smoke validation.

## Request authorization flow

1. The client sends `Authorization: Bearer <JWT>` for protected routes.
2. `protect` verifies the token and reloads the current user, so suspension or role changes take effect without waiting for token expiry.
3. `restrictTo(...)` checks the global role allowed by the route.
4. `requireHospitalAccess(...)` validates the hospital ID, hospital status, and active membership. Global administrators may cross hospital boundaries.
5. Patient-level services apply relationship, assignment, consent, or break-glass rules.
6. Mutating clinical or administrative actions create audit events where required.

## Deployment shape

The API is serverless-compatible. MongoDB connections are cached for warm Vercel invocations. The application must not rely on local filesystem persistence or process-local state for correctness. The current login limiter is in-memory and is therefore only basic protection; production scale should use a distributed limiter.

## Data boundary

Clinical records are hospital-scoped. A patient can have relationships with multiple hospitals, and each relationship carries hospital-specific MRN, assignment, and status. Do not query clinical collections by patient alone when the operation is hospital-specific.
