# Deployment and operations

## Environments

Maintain separate staging and production:

- separate Vercel projects or deployment environments;
- separate MongoDB Atlas databases or clusters;
- separate JWT secrets;
- separate Cloudinary folders/credentials;
- separate seed/demo accounts.

Never run synthetic seed scripts against production.

## Backend environment variables

Required:

- `MONGODB_URI`
- `JWT_SECRET`

Optional:

- `CORS_ORIGIN` — comma-separated allowed browser origins (the deployed web portal must be listed);
- `JWT_EXPIRES_IN` — web portal login lifetime, default `12h`;
- `JWT_MOBILE_EXPIRES_IN` — Flutter app login lifetime (doctor/patient only), default `30d`;
- `IMAGE_LINK_TTL_SECONDS` — lifetime of signed photo links in API responses, default `86400`;
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`;
- seed-specific variables documented by the seed scripts.

## MongoDB Atlas

Create a least-privilege application database user, configure network access, and keep the connection string only in deployment secrets. Enable backups appropriate to the selected Atlas tier. Perform a restore drill before the pilot.

## Vercel

1. Import the backend and frontend projects separately.
2. Add environment variables to Preview/Staging and Production independently.
3. Deploy staging first.
4. Verify `/api/health`, login, hospital listing, and a representative PD workflow.
5. Promote the reviewed build to production.

The frontend API base URL must point to the staging or production backend deliberately; never rely on a stale local or staging default during a production build.

## Release checklist

- Run backend syntax checks and `npm test`.
- Run `npm run audit:clinical-scope`.
- Run `npm run audit:frontend`.
- Build the frontend.
- Run the staging smoke test.
- Confirm Atlas backup status and restore point.
- Confirm CORS and environment variables.
- Confirm no demo accounts or synthetic data are present in production.
- Record release version, migration status, and rollback target.

## Rollback

Keep the previous Vercel deployment available, avoid destructive migrations, and make schema changes backward-compatible where possible. If clinical data integrity is in doubt, suspend affected workflows, preserve audit logs, and follow the incident-response procedure before rollback or repair.
