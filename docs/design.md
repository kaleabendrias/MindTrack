# MindTrack Backend — Design Notes

This is a high-level design reference for engineers maintaining the
MindTrack offline on-prem backend. It is intentionally kept short and
focuses on the architectural invariants that are easy to break by
accident. For the live route inventory see `docs/api-spec.md`.

## Layered architecture

```
interfaces/http        ← Express controllers, routers, middleware
application/services   ← Use cases; orchestrates repositories + auditing
application/security   ← Password policy, etc.
domain/                ← Pure entities, value objects, repository contracts
infrastructure/        ← Mongo models, encryption, token service, seed
```

The dependency direction is one-way: `interfaces → application → domain ←
infrastructure`. The domain has no imports from infrastructure or
interfaces. Repositories are defined as abstract classes in
`domain/repositories/` and implemented as `Mongo*Repository` in
`infrastructure/repositories/`.

## Protected route chain

Every authenticated route lives under the global `/api/v1` middleware
stack. There is no second-class auth surface — including for the
authenticated `/auth/*` routes.

```
helmet → cors → safeLogger → express.json
                                  │
        ┌─────────── /api/v1/auth (Phase 1, unauth) ─────────────┐
        │   /login, /refresh, /security-questions,                │
        │   /recover-password, /third-party                       │
        └─────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────── app.use("/api/v1", …) ──────────────────┐
        │   authenticate                                          │
        │   enforcePasswordRotation                               │
        │   requestSigningMiddleware (HMAC + nonce ledger + CSRF) │
        │   sessionRateLimiter   (Mongo bucket)                   │
        │   securityMonitoringMiddleware                          │
        └─────────────────────────────────────────────────────────┘
                                  │
        ┌─────────── /api/v1/auth (Phase 2, protected) ──────────┐
        │   /session, /rotate-password, /logout                   │
        └─────────────────────────────────────────────────────────┘
        ┌───────────── /api/v1/mindtrack ─────────────────────────┐
        ┌───────────── /api/v1/system ────────────────────────────┐
        ┌───────────── /api/v1/users ─────────────────────────────┐
                                  │
                              errorHandler
```

The two-phase split is the only correct way to keep `/auth/login` outside
the signing chain (no session exists yet) while keeping `/auth/session`
inside it. Mounting `/auth/session` on a separate router that bypasses the
chain — as the code did historically — created an exempt surface where
request signing, replay protection, session rate limiting, and security
monitoring did not run.

## Restore atomicity

`MongoSystemRepository.restoreCollections` runs the entire restore inside
`session.withTransaction(...)`. Multi-document transactions require a
replica set, so the repository:

1. Verifies the replica-set precondition at startup
   (`server.js → assertReplicaSet()`).
2. Re-verifies on every restore call before any destructive operation.
3. Throws `503 RESTORE_REQUIRES_REPLICA_SET` if the precondition fails.

There is **no** "best-effort sequential" fallback for standalone Mongo.
Partial state corruption is unacceptable on this code path; the system
fails closed instead.

The audit log collection (`auditLogSchema`) is excluded from restore.
Audit logs are append-only and any restore that overwrote them would
break the chain of custody.

## Replay-protected nonce ledger

`requestSigningMiddleware` calls `sessionRepository.recordNonce`, which is
an atomic two-phase Mongo operation:

1. `$pull` any nonce older than `NONCE_TTL_MS`.
2. Conditional `$push` that only inserts the new nonce if no surviving
   entry already matches it.

This rejects ANY previously seen nonce within its TTL — not just the most
recent one — which defends against non-consecutive replay attacks.

## Account-enumeration mitigations

- `GET /auth/security-questions` returns the same generic payload for any
  username, and is rate limited.
- `POST /auth/recover-password` returns `{ success: true }` for every
  shape-valid input, including non-existent username, wrong question,
  wrong answer, and locked accounts. The internal failure counter still
  ticks so login lockout still applies on the next `/login` attempt.

## Password rotation enforcement

Operator-provisioned passwords (seed, admin reset, registration) set
`mustRotatePassword=true` on the user. The `enforcePasswordRotation`
middleware blocks every `/api/v1` request from such a user with
`403 PASSWORD_ROTATION_REQUIRED` until they call
`POST /api/v1/auth/rotate-password`. Exempt routes are
`/api/v1/auth/session`, `/api/v1/auth/logout`, and
`/api/v1/auth/rotate-password` — the minimal set required for the user
to actually perform the rotation.

The test stack opts out via `SEED_REQUIRE_ROTATION=false` so existing
integration suites can authenticate seeded users directly without
rotating first. This env var must never be set in production.

## Persistent rate limiting

`MongoRateLimitRepository` backs every limiter against MongoDB so that
abuse-control budgets:

- survive backend process restarts,
- are shared across multiple backend instances in any future
  horizontal-scale deployment.

Three named limiters are exported from `rateLimitMiddleware.js`:

| Name | Bucket scope | Default budget |
| --- | --- | --- |
| `sessionRateLimiter`        | `session:<sessionId>`        | 60 / minute |
| `recoveryRateLimiter`       | `ip-recovery:<ip>`           | 5 / 15 min, 15-min lock |
| `questionLookupRateLimiter` | `ip-question-lookup:<ip>`   | 30 / 15 min |

## Validation

Every authenticated, mutating route is wrapped in
`validateRequest(<validator>)`. Validators live in
`apps/backend/src/interfaces/http/validation/` and use the helpers from
`requestValidation.js`. New routes MUST add a validator before merging —
validation is the only place where allowlists, allowed key sets, and
field-shape constraints are enforced. The service layer trusts that
validation has run.

The two highest-stakes validators are:

- `validateBackupRestoreRequest` — strict allowlist (`filename`, `reason`),
  filename regex `^mindtrack-backup-[A-Za-z0-9-]+\.enc\.json$`, length cap,
  and explicit `x-idempotency-key` header check.
- `validateRotatePasswordRequest` — strict allowlist
  (`currentPassword`, `newPassword`), both required as non-empty strings,
  ≤ 255 chars each.

## What does NOT exist (and never should)

- Any `/work-orders` endpoints. They were drafted in early specs but never
  mounted; documentation now reflects that and the e2e suite asserts the
  404. Do not add them back without an architectural review.
- Any in-memory rate-limit Maps, in-memory nonce caches, or in-memory
  session stores. State that must survive restarts lives in MongoDB.
- Any non-transactional restore path. Restore is replica-set-only.
