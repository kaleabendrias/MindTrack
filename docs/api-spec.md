# MindTrack Backend API Specification

This document is hand-derived from the actual route, controller, and service
code under `apps/backend/src/`. **It is the source of truth for which
endpoints exist on the running backend.** If a route is documented here it
is mounted in `appFactory.js`; if a route is not documented here, it does
not exist on the backend. Work-orders and any other previously-drafted
endpoints that are not in `appFactory.js` are explicitly removed (see
"Removed endpoints" at the bottom).

## Runtime configuration (`.env`)

The backend hard-fails at startup if any of the following are missing or do
not satisfy `requireSecureValue` (≥ 32 characters, no weak fragments such
as `change-me`, `password`, `secret`, `local-`, `0123456789abcdef`).

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGO_URI` | yes | Mongo connection string. Must point at a replica set — restore depends on multi-document transactions. |
| `MONGO_DB_NAME` | yes | Logical database name. |
| `AUTH_TOKEN_SECRET` | yes (secure) | Access-token HMAC secret. |
| `REFRESH_TOKEN_SECRET` | yes (secure) | Refresh-token HMAC secret. |
| `REQUEST_SIGNING_SECRET` | yes (secure) | Server-side seed used to derive per-session CSRF/signing keys. Never sent to the browser. |
| `DATA_ENCRYPTION_KEY` | yes (secure) | At-rest field encryption + backup encryption (SHA-256 → AES-256-GCM). |
| `BACKUP_DIRECTORY` | optional | Defaults to `/var/lib/offline-system/backups`. |
| `ATTACHMENT_DIRECTORY` | optional | Defaults to `/var/lib/offline-system/attachments`. |
| `APP_PORT` | optional | Defaults to `4000`. |
| `NODE_ENV` | optional | Defaults to `production`. |
| `COOKIE_SECURE` | optional | Defaults to `true`. Set to `false` for local HTTP development. |
| `SEED_REQUIRE_ROTATION` | optional | When `false`, seeded users are provisioned without `mustRotatePassword=true`. **Test stack only.** |
| `SEED_ADMIN_PASSWORD` / `SEED_CLINICIAN_PASSWORD` / `SEED_CLIENT_PASSWORD` | required by seed job | Initial passwords for the three seeded accounts. |

`./generate-secrets.sh` generates a fresh `.env` with cryptographically
random values. There is no in-code fallback; the application will refuse
to start without a valid `.env`.

## Replica-set requirement

The backend verifies at startup that MongoDB is running as a replica set
(`replSetGetStatus.ok === 1`). It exits with an error otherwise. The
`/system/backup-restore` endpoint also re-verifies on every call and
refuses to run with `503 RESTORE_REQUIRES_REPLICA_SET` if the precondition
ever stops holding. There is no degraded "best-effort sequential" restore
fallback.

## Common request headers for protected routes

All routes mounted under the `/api/v1` global middleware stack share the
same defense-in-depth chain:

1. `authenticate` — verifies the access token cookie.
2. `enforcePasswordRotation` — blocks the request with
   `403 PASSWORD_ROTATION_REQUIRED` until the user has rotated an
   operator-provisioned password (exempt: `/api/v1/auth/session`,
   `/api/v1/auth/logout`, `/api/v1/auth/rotate-password`).
3. `requestSigningMiddleware` — verifies HMAC signature, replay-protected
   nonce ledger, and (for mutating requests) the CSRF token.
4. `sessionRateLimiter` — Mongo-backed bucket; 60 requests/minute per
   session.
5. `securityMonitoringMiddleware` — emits security flags on abnormal
   patterns.

Required headers on every protected request:

- Cookies: `mindtrack_access_token`, `mindtrack_refresh_token`
- `x-signature`, `x-signature-timestamp`, `x-signature-nonce`

For mutating requests (POST/PATCH/DELETE):

- `x-csrf-token`
- `x-request-nonce`

For critical writes (sign, amend, restore, merge, backup-run, backup-restore):

- `x-idempotency-key`

## Authentication routes (`/api/v1/auth`)

The `/auth` namespace is split into two phases. The first phase mounts
**before** the protected middleware stack and contains only the routes that
are meaningful before a session exists. The second phase mounts **inside**
the protected stack so authenticated auth endpoints share exactly the same
chain as every other protected route.

### Phase 1 — bootstrap (no session yet)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/login` | none | `{ username, password }` |
| POST | `/refresh` | refresh cookie or body | `{ refreshToken? }` |
| GET  | `/security-questions` | none, **rate limited** | `?username=`. Returns a uniform generic payload regardless of username validity. |
| POST | `/recover-password` | none, rate limited | `{ username, question, answer, newPassword }`. Always returns `{ data: { success: true } }`. |
| POST | `/third-party` | n/a (disabled) | Stub. |

### Phase 2 — protected (full /api/v1 chain applies)

| Method | Path | Notes |
| --- | --- | --- |
| GET  | `/session` | Requires the full signed-header chain. Returns `{ csrfToken, user }`. |
| POST | `/rotate-password` | `{ currentPassword, newPassword }` (strict allowlist validator). Clears `mustRotatePassword`. |
| POST | `/logout` | Revokes the current session. |

### `GET /auth/security-questions`

Returns a generic, non-enumerable payload regardless of whether the
supplied `username` matches a real account:

```json
{ "data": [{ "question": "What is your account recovery question?" }] }
```

This endpoint is rate limited per source IP. Real questions are never
exposed by an unauthenticated lookup.

### `POST /auth/recover-password`

Returns `{ "data": { "success": true } }` for **every** input that satisfies
the request schema, including non-existent username, wrong question, wrong
answer, or locked account. The only branching outcome is a `400` for a
weak `newPassword` (which validates attacker-supplied input only and
therefore leaks no account state).

## System routes (`/api/v1/system`)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/offline-policy` | session | Reports offline-only posture. |
| GET | `/profile-fields` | session | Current PII profile field configuration. |
| GET | `/my-security-flags` | session | Self-scoped — caller's security flags only. |
| GET | `/security-flags` | `AUDIT_READ` | Globally scoped admin view. Filters: `userId`, `sessionId`, `ruleCode`, `from`, `to`, `limit` (default 200, max 1000). |
| GET | `/backup-status` | `AUDIT_READ` | Lists backup files and schedule. |
| PATCH | `/profile-fields` | `USER_MANAGE` | `{ profileFields, reason }` — strict validator |
| POST | `/profile-fields/custom` | `USER_MANAGE` | `{ field, reason }` — strict validator |
| PATCH | `/profile-fields/custom/:key` | `USER_MANAGE` | `{ updates, reason }` — strict validator |
| DELETE | `/profile-fields/custom/:key` | `USER_MANAGE` | `{ reason }` — strict validator |
| POST | `/backup-run` | `AUDIT_READ` | `{ reason? }` |
| GET | `/backup-files` | `AUDIT_READ` | — |
| POST | `/backup-restore` | `AUDIT_READ` | `{ filename, reason }` + `x-idempotency-key`. Strict validator. |
| GET | `/audit-immutability-check` | `AUDIT_READ` | — |

### `POST /system/backup-restore`

`validateBackupRestoreRequest` rejects the request with `400` before any
service code runs if:

- the body has unknown keys,
- `filename` is missing, empty, > 200 chars, or does not match
  `^mindtrack-backup-[A-Za-z0-9-]+\.enc\.json$`,
- `reason` is missing or empty,
- `x-idempotency-key` is missing or > 200 chars.

The service then resolves the filename through `resolveBackupPath`, which
re-applies the regex and asserts canonical-path containment under the
configured backup directory before any filesystem access.

The restore itself runs inside a single MongoDB transaction
(`session.withTransaction`). On any failure during restore the transaction
is aborted, the database stays in its prior state, and the API returns
`500 RESTORE_ROLLED_BACK`. If the precondition check fails (e.g. Mongo is
not a replica set), the API returns `503 RESTORE_REQUIRES_REPLICA_SET`
**before** any destructive write — there is no degraded fallback path.

The `auditLogSchema` collection is **explicitly excluded** from restore.
The audit log is append-only and is never overwritten.

A successful restore response:

```json
{
  "data": {
    "success": true,
    "filename": "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json",
    "generatedAt": "2026-04-07T00:00:00.000Z",
    "transactional": true,
    "auditLogsPreserved": true
  }
}
```

### `GET /system/security-flags` (admin)

Globally scoped admin endpoint. Example:

```
GET /api/v1/system/security-flags?userId=u1&ruleCode=RULE_RAPID_RECORD_LOOKUP&from=2026-04-01T00:00:00Z&to=2026-04-07T23:59:59Z&limit=500
```

## MindTrack routes (`/api/v1/mindtrack`)

| Method | Path |
| --- | --- |
| GET | `/clients` |
| GET | `/self-context` |
| POST | `/clients` |
| POST | `/clients/merge` |
| PATCH | `/clients/:clientId` |
| PATCH | `/clients/:clientId/governance` |
| GET | `/clients/:clientId/timeline` |
| POST | `/entries` |
| GET | `/entries/:entryId/attachments/:fingerprint` |
| POST | `/entries/:entryId/sign` |
| POST | `/entries/:entryId/amend` |
| POST | `/entries/:entryId/delete` |
| POST | `/entries/:entryId/restore` |
| GET | `/search` |
| GET | `/search/trending` |
| GET | `/recommendations/nearby` |

## User routes (`/api/v1/users`)

| Method | Path | Permission |
| --- | --- | --- |
| GET  | `/` | `USER_MANAGE` |
| POST | `/` | `USER_MANAGE` |
| POST | `/:id/reset-password` | `USER_MANAGE` |

## Removed endpoints

The following endpoints **do not exist** and are not mounted by
`appFactory.js`. They previously appeared in older drafts of this
specification and are removed here so the doc matches the running route
inventory exactly:

- `GET /api/v1/work-orders`
- `POST /api/v1/work-orders`
- `PATCH /api/v1/work-orders/:id`
- `DELETE /api/v1/work-orders/:id`
- any other `/work-orders` route

The e2e suite (`e2e/tests/roles.test.mjs`) asserts that
`GET /api/v1/work-orders` returns `404` to lock this in.
