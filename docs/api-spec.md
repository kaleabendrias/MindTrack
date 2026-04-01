# MindTrack Offline API Specification

## 1. Base Information
- Base URL: http://localhost:4000
- API prefix: /api/v1
- Health endpoint: /healthz
- Content type: application/json

## 2. Authentication and Request Security
Authentication model:
- Login issues cookie-based session state.
- Session check is available at GET /api/v1/auth/session.

Protected routes under /api/v1 (except login/refresh/recover/third-party) require:
- Valid authenticated session cookie.
- HMAC signature headers:
  - x-signature-timestamp
  - x-signature-nonce
  - x-signature

Mutating requests also require:
- x-csrf-token
- x-request-nonce

Critical write endpoints additionally require:
- x-idempotency-key

Typical errors:
- 401 unauthorized/missing trusted headers/bad signature
- 403 forbidden (role/permission mismatch)
- 409 governance or concurrency conflict
- 429 rate limit exceeded

## 3. Endpoint Groups

### 3.1 Health
- GET /healthz
  - 200: { "status": "ok" }

### 3.2 Auth
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/recover-password
- GET /api/v1/auth/session
- POST /api/v1/auth/third-party
- POST /api/v1/auth/logout

Notes:
- recover-password is rate-limited.
- session requires authentication middleware.

### 3.3 MindTrack
Client and timeline domain:
- GET /api/v1/mindtrack/clients
- GET /api/v1/mindtrack/self-context
- POST /api/v1/mindtrack/clients
- POST /api/v1/mindtrack/clients/merge
- PATCH /api/v1/mindtrack/clients/:clientId
- PATCH /api/v1/mindtrack/clients/:clientId/governance
- GET /api/v1/mindtrack/clients/:clientId/timeline

Entry lifecycle:
- POST /api/v1/mindtrack/entries
- POST /api/v1/mindtrack/entries/:entryId/sign
- POST /api/v1/mindtrack/entries/:entryId/amend
- POST /api/v1/mindtrack/entries/:entryId/restore

Search and recommendations:
- GET /api/v1/mindtrack/search
  - Query includes q, channel, sort and related filters.
- GET /api/v1/mindtrack/search/trending
- GET /api/v1/mindtrack/recommendations/nearby
  - Query includes clientId and radiusMiles.

Behavioral notes verified by integration tests:
- Client role is restricted to self-context and cannot access another client timeline.
- Merge endpoint supports idempotent replay behavior with same idempotency key.
- Governance legal hold can block mutation operations with conflict responses.

### 3.4 System
- GET /api/v1/system/offline-policy
- GET /api/v1/system/profile-fields
- PATCH /api/v1/system/profile-fields
- GET /api/v1/system/my-security-flags
- GET /api/v1/system/security-flags
- GET /api/v1/system/backup-status
- POST /api/v1/system/backup-run
- GET /api/v1/system/audit-immutability-check

Permission notes:
- security-flags, backup-status, backup-run, and audit-immutability-check require audit-read level access.
- profile-fields update requires user-manage level access.

### 3.5 Users
- GET /api/v1/users
- POST /api/v1/users
- POST /api/v1/users/:id/reset-password

All users routes require user-manage permission.

### 3.6 Work Orders
- GET /api/v1/work-orders
- POST /api/v1/work-orders
- PATCH /api/v1/work-orders/:id/status
- DELETE /api/v1/work-orders/:id

## 4. Example Flow
1. POST /api/v1/auth/login with username/password.
2. Read csrfToken and requestSigningKey from login payload.
3. Call protected GET endpoints with signed headers.
4. For POST/PATCH/DELETE also include CSRF + nonce headers.
5. For critical write operations include x-idempotency-key.

## 5. Non-Functional API Constraints
- Offline-only policy is exposed by GET /api/v1/system/offline-policy.
- PII visibility is permission-gated and may be masked for lower-privileged roles.
- Session-scoped rate limiting is active for protected routes.
