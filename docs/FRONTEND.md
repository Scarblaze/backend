# Frontend guide

The active portal is the TypeScript/Vite application in `D:\BTECH\Sem 7\FYP\frontend`. `src/main.tsx` is the active entrypoint. Older JSX files remain for historical compatibility but are not the active application entry.

## Navigation by role

### Platform admin

- Platform overview and statistics.
- Hospital directory and hospital creation.
- Hospital activation/suspension.
- Cross-hospital data access subject to platform policy.
- System health and audit visibility.

### Hospital admin

- Hospital dashboard.
- Patient directory and patient registration.
- Detailed patient record.
- Care-team and staff management.
- Assignment, transfers, break-glass review, audit, and settings.

### Doctor

- Assigned-patient directory.
- Patient profile and PD clinical history.
- Verification and risk/follow-up worklists as exposed by the current build.

### Assistant doctor and care staff

The backend controls their assigned relationship scope. The UI should expose only the queues and record areas appropriate to the active role and hospital membership.

## Shared UI behavior

- `services/apiClient.ts` is the typed API boundary.
- Notification center loads recipient-specific notifications and supports read state/action links.
- Forms display inline errors and success messages.
- Patient details are opened from the hospital-scoped relationship list.
- The frontend must treat backend authorization as authoritative.

## Frontend/backend contract

When adding a feature:

1. Add or update the backend route and authorization test.
2. Update the typed API client response/request types.
3. Add the page/component behavior.
4. Confirm loading, empty, error, success, and unauthorized states.
5. Run the frontend audit and production build.

Avoid placing page logic into a single monolithic component. Keep pages, reusable components, typed API calls, and styles separated by responsibility.
