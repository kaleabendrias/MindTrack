# MindTrack System Design

## 1. Purpose

MindTrack is a fully offline, on-premises outpatient mental-health tracking system. It is delivered as a Docker Compose stack with no external service dependencies. This document describes the architecture, the layered module boundary contracts, and the explicit security posture decisions that govern the system.

## 2. Layered Architecture

The backend is decomposed into three strict layers. Each layer is allowed to depend only on the layer directly below it; no upward or cross-layer coupling is permitted.

```
┌────────────────────────────────────────────────┐
│  HTTP Interface Layer                          │
│  apps/backend/src/interfaces/http              │
│  routes, controllers, middleware, validators   │
├────────────────────────────────────────────────┤
│  Application Service Layer                     │
│  apps/backend/src/application/services         │
│  AuthService, MindTrackService, SystemService  │
│  AuditService, IdempotencyService, etc.        │
├────────────────────────────────────────────────┤
│  Infrastructure Layer                          │
│  apps/backend/src/infrastructure               │
│  MongoDB repositories, persistence, security   │
└────────────────────────────────────────────────┘
```

### 2.1 HTTP Interface Layer

Responsible for: request parsing, input validation, authentication/authorization middleware, request signing enforcement, rate limiting, and routing. Controllers are thin: they extract validated inputs from the request and delegate to an application service, then format the service result as an HTTP response. No business logic lives here.

Key modules:
- `appFactory.js` — wires the full Express application, mounts middleware chains, and composes routes
- `middleware/authMiddleware.js` — session authentication and password-rotation enforcement
- `middleware/requestSigningMiddleware.js` — HMAC request-signing and replay prevention
- `middleware/rateLimitMiddleware.js` — per-IP rate limiters for recovery and session paths
- `validation/` — Zod-based request validators; requests that fail schema validation are rejected before reaching a service

### 2.2 Application Service Layer

Responsible for: all business logic, object-level authorization, audit logging, idempotency enforcement, and domain rule enforcement. Services receive plain data (not HTTP request objects) and return plain data (not HTTP response objects), making them independently testable without an HTTP runtime.

Key services:
- `AuthService` — login, session management, password rotation/recovery, security-question challenge
- `MindTrackService` — timeline entries, attachments, search, trending, client management
- `SystemService` — backup/restore, retention, legal hold, audit immutability, security flag monitoring
- `AuditService` — append-only audit log entries; write path is separate from read so audit records are never mutated through normal service paths
- `IdempotencyService` — deduplication of critical write operations (sign, amend, restore, merge, backup-run)

### 2.3 Infrastructure Layer

Responsible for: MongoDB repository implementations, encryption-at-rest for PII fields, password hashing, token issuance/verification, and request signing utilities. The infrastructure layer implements interfaces defined by the application layer; no infrastructure type leaks upward into business logic.

## 3. Request Authentication and Signing Model

All routes under `/api/v1` (except the unauthenticated bootstrap subset) are protected by a layered middleware chain assembled in `appFactory.js`:

```
authenticate → enforcePasswordRotation → signedRequestRequired
  → sessionRateLimiter → securityMonitoring
```

- **authenticate** — verifies the access token (JWT, short-lived, HTTP-only cookie), loads the session and user, and injects the actor into `req.actor`.
- **enforcePasswordRotation** — rejects any request if the actor's `mustRotatePassword` flag is set; the only exit is `POST /api/v1/auth/rotate-password`.
- **signedRequestRequired** — verifies the HMAC signature produced by the frontend using the per-session CSRF token as the signing key. Checks timestamp freshness, nonce uniqueness (replay prevention), and body-hash integrity.
- **sessionRateLimiter** — 60 requests/minute per session.
- **securityMonitoring** — records anomaly signals (unusual IP, unusual user agent) to the security flag store.

Critical mutating endpoints (sign, amend, restore, merge, backup-run) additionally require an `x-idempotency-key` header and are deduplicated by `IdempotencyService`.

## 4. Recovery and Anti-Enumeration Design

The password-recovery flow has two stages:

**Stage 1 — `GET /auth/security-questions?username=<username>`**
Returns exactly one generic challenge label (`"What is your account recovery question?"`) for every caller, regardless of whether the username exists, whether it has configured questions, or how many questions it has. This uniform response is a deliberate anti-enumeration measure: an unauthenticated observer cannot distinguish a registered account from a non-existent one by comparing responses from this endpoint. The user-configured question text is intentionally withheld at this stage.

**Stage 2 — `POST /auth/recover-password`**
Accepts a `username`, `answer`, and `newPassword`. The backend checks the provided answer against all of the account's configured question entries using constant-time comparison. If any entry matches, the password is reset and `{ success: true, reset: true }` is returned. All failure modes (non-existent user, wrong answer, locked account) return `{ success: true, reset: false }` — the same HTTP 200 shape — so that automated probing cannot extract account-existence or answer-correctness signals. The `reset` boolean is sufficient for the frontend to display accurate feedback to a legitimate user without leaking state to scanners.

Both endpoints are rate-limited by dedicated limiters (`questionLookupRateLimiter`, `recoveryRateLimiter`) that are independent of the authenticated session rate limiter.

## 5. Security Posture

### 5.1 Public-Surface Endpoints

The following endpoints are intentionally reachable without authentication. Each is listed with the explicit rationale for its public exposure:

| Endpoint | Method | Purpose | Rationale for public access |
|---|---|---|---|
| `/healthz` | GET | Liveness probe | Required by Docker Compose `healthcheck` and by any load balancer or ingress controller performing service-discovery liveness checks. Returns only `{ "status": "ok" }` — no internal state, no session data, no configuration values. Moving this behind the authenticated middleware chain would break Docker's built-in container orchestration since the health checker has no credentials. This public exposure is intentional, low-risk, and consistent with industry-standard health-probe design. Network-level access can be restricted to the local Docker bridge network or a trusted ingress if needed. |
| `/api/v1/auth/login` | POST | Session bootstrap | Must be public to bootstrap a session; no signing key or CSRF token exists before login. |
| `/api/v1/auth/refresh` | POST | Token refresh | Requires only the refresh-token cookie, not a full signed request; runs before the protected chain. |
| `/api/v1/auth/security-questions` | GET | Recovery stage 1 | Always returns a uniform generic label (see §4); no account-existence signal is emitted. Rate-limited. |
| `/api/v1/auth/recover-password` | POST | Recovery stage 2 | Uniform 200 response regardless of validity (see §4). Rate-limited. |
| `/api/v1/auth/third-party` | POST | Reserved (disabled) | Disabled in offline/on-prem mode; placeholder rejects all requests at the service layer. |

All other routes require a valid authenticated session plus a correctly signed request.

### 5.2 Secrets and Runtime Configuration

All cryptographic secrets (`AUTH_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `REQUEST_SIGNING_SECRET`, `DATA_ENCRYPTION_KEY`) are:

- **Never committed to the repository.** The `.env` file is git-ignored.
- **Dynamically generated at container startup** by `apps/backend/docker-entrypoint.sh`, which uses the Node.js `crypto.randomBytes` CSPRNG (sourced from the kernel). Generated secrets are persisted to a chmod-700 directory on the shared Docker volume so all containers in the stack use identical keys without requiring an external secret manager.
- **Validated at startup** by `src/config/index.js`, which hard-fails if any required secret is absent or matches a known-weak pattern (empty value, length < 32, or fragments such as `change-me` or `password`).
- **Overridable** by setting the variables in the host environment before running `docker compose up`; the entrypoint skips generation for variables already set to non-empty values. `run_tests.sh` uses this mechanism: it exports ephemeral `openssl rand -hex 32` values and passes them to the Compose stack for every test run, ensuring no cross-run state.

### 5.3 Cookie and Session Security

- Access tokens and refresh tokens are stored in HTTP-only cookies; they are never accessible to frontend JavaScript.
- `Secure: true` is set on all cookies in production (requires HTTPS termination). Set `COOKIE_SECURE=false` only for localhost-only development without TLS.
- CSRF tokens are derived server-side from `REQUEST_SIGNING_SECRET` and are held only in browser memory; they are never written to local storage or sent in cookies.
- Each session carries a unique CSRF-derived per-session signing key; compromising one session does not affect others.

### 5.4 PII Protection

- `phone` and `address` fields on MindTrack client records are encrypted at rest using the `DATA_ENCRYPTION_KEY`.
- API responses mask PII fields by default; callers with the `PII_VIEW` permission (administrators only) receive plaintext values.
- Morgan request logging uses a custom formatter that redacts the full path for `/api/v1/auth` requests so that usernames and passwords are never written to application logs.

### 5.5 Audit Immutability

- Audit log records are written through `AuditService` using an append-only path with schema-level hooks that prevent updates and deletes.
- The backup-restore flow explicitly skips the audit-log collection, preserving the ledger across restores.
- `GET /api/v1/system/audit-immutability-check` provides an operator-visible integrity check.

## 6. Geospatial Module

The geospatial utilities in `apps/backend/src/application/geo/` support address-based proximity matching for clinician recommendation:

- `parseUsAddress(address)` — parses a single-line US address string into structured components:
  - `zip` — 5-digit ZIP code (primary lookup key)
  - `street` — normalized street line (trimmed, collapsed whitespace)
  - `city` — normalized city name (trimmed, title-cased)
  - `state` — validated 2-letter USPS state/territory abbreviation (upper-cased; returns `""` if unrecognized)
- `centroidFromZip(zip)` — returns a `{ lat, lon }` centroid for the ZIP code using an embedded dataset; falls back to a 3-digit prefix match when an exact entry is absent.
- `haversineMiles(a, b)` — great-circle distance in miles between two `{ lat, lon }` points.

The local ZIP centroid dataset covers all major US metro areas. When neither an exact nor a prefix match is found, `centroidFromZip` returns `null` and the caller is responsible for degrading gracefully (e.g., omitting distance from the recommendation sort key).

## 7. Data Governance

- **Retention**: MindTrack client and entry metadata is retained for 7 years. The `RetentionService` enforces this boundary and blocks mutation on records within a legal hold.
- **Legal hold**: Governed records are blocked from sign, amend, restore, merge, and critical idempotent writes.
- **Backups**: Nightly encrypted local backups are written to `/var/lib/offline-system/backups` and retained for 30 days. Restore operations are wrapped in a MongoDB transaction; on failure the transaction is rolled back and the system remains in its prior state.
