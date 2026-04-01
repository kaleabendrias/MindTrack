# MindTrack Offline Design

## 1. Purpose and Scope
MindTrack Offline is an on-prem, fully offline mental-health workflow system. It provides role-based workflows for administrator, clinician, and client users, with auditability, data governance, and strict request protection controls.

Goals:
- Run entirely in a local environment with Docker Compose.
- Keep PHI/PII protected at rest and in transit.
- Enforce object-level authorization and role boundaries.
- Support governance controls: audit immutability, legal hold, retention, and encrypted backups.

## 2. High-Level Architecture
Runtime services (docker-compose):
- frontend: React SPA served by Nginx, exposed on port 3000.
- backend: Node.js + Express API, exposed on port 4000.
- mongodb: MongoDB 7 with replica set rs0.
- mongo-rs-init: one-shot replica set initializer.
- mongo-seed: deterministic seed/bootstrap job.
- test-runner and e2e-runner: containerized test executors.

Layering:
- HTTP interface: apps/backend/src/interfaces/http
- Application services: apps/backend/src/application/services
- Domain: apps/backend/src/domain
- Infrastructure repositories/persistence: apps/backend/src/infrastructure

## 3. Backend Design
Core composition is wired in appFactory.js:
- Repositories (Mongo*) are instantiated first.
- Services are composed from repositories.
- Controllers expose service behavior via route modules.
- Middleware stack enforces authentication, request signing, rate limit, and security monitoring.

Main route groups:
- /healthz
- /api/v1/auth
- /api/v1/work-orders
- /api/v1/mindtrack
- /api/v1/system
- /api/v1/users

Security pipeline for protected routes:
1. Session authentication (cookie-backed).
2. HMAC request signing validation.
3. Session rate limiting.
4. Behavioral security monitoring flagging.

## 4. Frontend Design
Frontend is a React + Vite SPA:
- App bootstraps by fetching /api/v1/auth/session.
- Role-based route policy sends users to:
  - /administrator
  - /clinician
  - /client
- Client role receives self-context only.
- Clinician/administrator roles get search and discovery surfaces.
- Logout clears in-memory auth and UI state.

Primary app modules:
- apps/frontend/src/modules/administrator
- apps/frontend/src/modules/clinician
- apps/frontend/src/modules/client
- Shared components in apps/frontend/src/shared/ui

## 5. Security and Privacy Controls
Implemented controls in code and tests:
- HTTP-only cookie sessions for auth.
- CSRF token and request nonce on mutating operations.
- Per-session HMAC request signatures.
- Idempotency keys on critical write endpoints.
- Account lockout and request rate limiting.
- Role and permission checks for privileged actions.
- PII masking by default without PII_VIEW privilege.
- Encrypted-at-rest fields for sensitive client data.
- Immutable audit logging.

## 6. Data Governance Design
Governance capabilities include:
- Legal hold at client level to block mutation paths.
- Retention metadata tracking.
- Backup status endpoint with nightly schedule semantics.
- Manual backup execution endpoint producing encrypted artifact names.
- Audit immutability check endpoint.

## 7. Testing Design
Test strategy combines unit, integration, and E2E:
- Backend unit tests: unit_tests/backend
- Frontend unit tests: unit_tests/frontend
- API integration tests: API_tests
- E2E tests: e2e/tests

Single entrypoint:
- ./run_tests.sh starts required containers and runs all suites.

## 8. Operational Constraints
- Offline-only policy: external network integrations are disabled.
- Docker Compose is the supported runtime entrypoint.
- Deterministic seed data enables reproducible verification and testing.
