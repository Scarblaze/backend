# Security and privacy controls

## Implemented controls

- JWT authentication. Browser (web portal) logins expire after 12 hours (`JWT_EXPIRES_IN`). Logins from the Flutter app (doctor and patient roles, no `Origin` header) last 30 days (`JWT_MOBILE_EXPIRES_IN`) because the app has no token refresh; portal-only roles are always short-lived.
- Current-user reload on protected requests, so suspended accounts and role changes take effect promptly.
- Role middleware plus hospital membership checks.
- Suspended-hospital blocking for ordinary members.
- Restricted CORS defaults; production origins must be explicitly configured.
- Security headers: `nosniff`, frame denial, referrer policy, and permissions policy.
- Login attempt throttling by IP and normalized email.
- Password hashing with bcrypt.
- Invitation tokens and image tokens are not used as unrestricted database identifiers.
- Image retrieval: a bare `/api/images/:token` requires a Bearer token and patient/hospital authorization. The photo URLs returned inside API responses carry a signed, expiring link (HMAC, 24 hours by default, `IMAGE_LINK_TTL_SECONDS`) so the Flutter app's `Image.network` works without headers. A bad or expired signature is always refused. Anyone holding a freshly issued link can view that one photo until it expires, so treat API responses as sensitive.
- Hospital-scoped clinical queries and relationship checks.
- Audit events for important administration and clinical governance actions.
- Input validation for IDs, roles, status values, invitation expiry, and assignment membership.
- No secrets should be committed; `.env` is ignored.

## Security review checklist

- Verify every new route has authentication before deployment.
- Verify every hospital route has a hospital boundary.
- Verify every patient route has either relationship, assignment, consent, or break-glass logic.
- Do not trust frontend role checks.
- Do not return password hashes, invitation hashes, or private image storage credentials.
- Avoid logs containing passwords, JWTs, invitation tokens, or unnecessary patient data.
- Confirm notification action URLs cannot cross an unauthorized boundary.
- Confirm exports and reports use the same hospital filters as interactive pages.

## Known production hardening items

1. Replace the process-local login limiter with Redis or a managed distributed limiter.
2. Add centralized error tracking and alerting.
3. Use separate Atlas databases for staging and production.
4. Configure least-privilege Atlas database users and private networking where practical.
5. Test backup restoration, not only backup creation.
6. Decide retention, deletion, and legal-hold policies with the hospital and privacy team.
7. Use Cloudinary or another managed object store for production images rather than growing MongoDB documents.
8. Complete penetration testing and clinical privacy review before the pilot.

## Incident response minimum

Suspend affected accounts or hospitals, preserve audit events, rotate JWT and database credentials when compromise is suspected, inspect image and access logs, notify the responsible privacy/security officers, and document remediation before reactivation.
