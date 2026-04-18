# Test Coverage Audit

## Scope and Method
- Mode: static inspection only.
- Executed: file reads and static search only.
- Not executed: tests, scripts, containers, builds, package managers.
- Project type declaration found: `<!-- project-type: fullstack -->` in `repo/README.md`.

## Strict Endpoint Inventory (Resolved METHOD + PATH)
Route prefix resolution evidence:
- `createHealthRoutes()` mounted at root in `repo/apps/backend/src/interfaces/http/appFactory.js`.
- `createUnauthAuthRoutes()` and `createProtectedAuthRoutes()` mounted at `/api/v1/auth` in `repo/apps/backend/src/interfaces/http/appFactory.js`.
- Protected middleware chain mounted at `/api/v1` before protected auth/mindtrack/system/users in `repo/apps/backend/src/interfaces/http/appFactory.js`.
- `createMindTrackRoutes()` mounted at `/api/v1/mindtrack`.
- `createSystemRoutes()` mounted at `/api/v1/system`.
- `createUserRoutes()` mounted at `/api/v1/users`.

### Backend Endpoint Inventory
1. `GET /healthz`
2. `POST /api/v1/auth/login`
3. `POST /api/v1/auth/refresh`
4. `GET /api/v1/auth/security-questions`
5. `POST /api/v1/auth/recover-password`
6. `POST /api/v1/auth/third-party`
7. `GET /api/v1/auth/session`
8. `POST /api/v1/auth/rotate-password`
9. `POST /api/v1/auth/logout`
10. `GET /api/v1/mindtrack/clients`
11. `GET /api/v1/mindtrack/self-context`
12. `POST /api/v1/mindtrack/clients`
13. `POST /api/v1/mindtrack/clients/merge`
14. `PATCH /api/v1/mindtrack/clients/:clientId`
15. `PATCH /api/v1/mindtrack/clients/:clientId/governance`
16. `GET /api/v1/mindtrack/clients/:clientId/timeline`
17. `POST /api/v1/mindtrack/entries`
18. `GET /api/v1/mindtrack/entries/:entryId/attachments/:fingerprint`
19. `POST /api/v1/mindtrack/entries/:entryId/sign`
20. `POST /api/v1/mindtrack/entries/:entryId/amend`
21. `POST /api/v1/mindtrack/entries/:entryId/delete`
22. `POST /api/v1/mindtrack/entries/:entryId/restore`
23. `GET /api/v1/mindtrack/search`
24. `GET /api/v1/mindtrack/search/trending`
25. `GET /api/v1/mindtrack/recommendations/nearby`
26. `GET /api/v1/system/offline-policy`
27. `GET /api/v1/system/profile-fields`
28. `GET /api/v1/system/my-security-flags`
29. `GET /api/v1/system/security-flags`
30. `GET /api/v1/system/backup-status`
31. `PATCH /api/v1/system/profile-fields`
32. `POST /api/v1/system/profile-fields/custom`
33. `PATCH /api/v1/system/profile-fields/custom/:key`
34. `DELETE /api/v1/system/profile-fields/custom/:key`
35. `POST /api/v1/system/backup-run`
36. `GET /api/v1/system/backup-files`
37. `POST /api/v1/system/backup-restore`
38. `GET /api/v1/system/audit-immutability-check`
39. `GET /api/v1/users`
40. `POST /api/v1/users`
41. `POST /api/v1/users/:id/reset-password`

## API Test Mapping Table
Legend:
- Test type values: `true no-mock HTTP`, `HTTP with mocking`, `unit-only/indirect`.
- Coverage requires exact method+path hit.

| Endpoint | Covered | Test Type | Test Files | Evidence |
|---|---|---|---|---|
| GET /healthz | yes | true no-mock HTTP | e2e/tests/roles.test.mjs | `test("frontend serves pages and API proxy is operational")`, direct `fetch(${BACKEND}/healthz)` |
| POST /api/v1/auth/login | yes | true no-mock HTTP | API_tests/auth.integration.test.mjs, API_tests/helpers.mjs, e2e/tests/roles.test.mjs | `test("login response body schema has required fields")`; `login()` helper sends POST `/api/v1/auth/login` |
| POST /api/v1/auth/refresh | yes | true no-mock HTTP | API_tests/auth.integration.test.mjs, e2e/tests/roles.test.mjs | `test("POST /auth/refresh issues a new access token...")`; `test("E2E: auth token refresh flow...")` |
| GET /api/v1/auth/security-questions | yes | true no-mock HTTP | API_tests/auth.integration.test.mjs | `test("unauthenticated /auth/security-questions always returns...")` |
| POST /api/v1/auth/recover-password | yes | true no-mock HTTP | API_tests/auth.integration.test.mjs, e2e/tests/roles.test.mjs | `test("/auth/recover-password returns uniform success...")`; `test("password recovery throttling...")` |
| POST /api/v1/auth/third-party | yes | true no-mock HTTP | API_tests/security.integration.test.mjs | `test("POST /auth/third-party is rejected...")` |
| GET /api/v1/auth/session | yes | true no-mock HTTP | API_tests/auth.integration.test.mjs, API_tests/security.integration.test.mjs, e2e/tests/roles.test.mjs | `test("/auth/session requires the full signed-header chain...")` |
| POST /api/v1/auth/rotate-password | yes | true no-mock HTTP | API_tests/auth.integration.test.mjs | `test("POST /auth/rotate-password happy path...")` |
| POST /api/v1/auth/logout | yes | true no-mock HTTP | API_tests/auth.integration.test.mjs, e2e/tests/roles.test.mjs | `test("POST /auth/logout clears the authenticated session")`; `test("E2E: auth logout invalidates the session")` |
| GET /api/v1/mindtrack/clients | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, API_tests/security.integration.test.mjs, API_tests/backup.integration.test.mjs, e2e/tests/roles.test.mjs | `test("permission-gated PII visibility...")` |
| GET /api/v1/mindtrack/self-context | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, e2e/tests/roles.test.mjs | `test("permission-gated PII visibility...")` |
| POST /api/v1/mindtrack/clients | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, API_tests/backup.integration.test.mjs, e2e/tests/roles.test.mjs | `test("administrator create-client requires valid primaryClinicianId")` |
| POST /api/v1/mindtrack/clients/merge | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs | `test("merge flow preserves audit immutability...")` |
| PATCH /api/v1/mindtrack/clients/:clientId | yes | true no-mock HTTP | e2e/tests/roles.test.mjs | `test("clinician E2E: login, list clients... profile edit...")` uses PATCH `/api/v1/mindtrack/clients/${newClientId}` |
| PATCH /api/v1/mindtrack/clients/:clientId/governance | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs | `test("retention and legal-hold enforcement...")` |
| GET /api/v1/mindtrack/clients/:clientId/timeline | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, API_tests/security.integration.test.mjs, e2e/tests/roles.test.mjs | `test("permission-gated PII visibility...")` |
| POST /api/v1/mindtrack/entries | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, API_tests/security.integration.test.mjs, e2e/tests/roles.test.mjs | `test("entry amend: create → amend...")` |
| GET /api/v1/mindtrack/entries/:entryId/attachments/:fingerprint | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, API_tests/security.integration.test.mjs | `test("attachment download requires the full signed-header chain...")` |
| POST /api/v1/mindtrack/entries/:entryId/sign | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs | `test("retention and legal-hold enforcement...")` |
| POST /api/v1/mindtrack/entries/:entryId/amend | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, e2e/tests/roles.test.mjs | `test("entry amend: create → amend...")`; `test("E2E: full entry lifecycle...")` |
| POST /api/v1/mindtrack/entries/:entryId/delete | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, e2e/tests/roles.test.mjs | `test("entry delete and restore...")` |
| POST /api/v1/mindtrack/entries/:entryId/restore | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, e2e/tests/roles.test.mjs | `test("entry delete and restore...")`; `test("E2E: full entry lifecycle...")` |
| GET /api/v1/mindtrack/search | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, e2e/tests/roles.test.mjs | `test("/mindtrack/search rejects malformed regex inputs...")` |
| GET /api/v1/mindtrack/search/trending | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, e2e/tests/roles.test.mjs | `test("GET /mindtrack/search/trending returns...")` |
| GET /api/v1/mindtrack/recommendations/nearby | yes | true no-mock HTTP | API_tests/backup.integration.test.mjs | `test("backup lifecycle, radius constraints...")` |
| GET /api/v1/system/offline-policy | yes | true no-mock HTTP | API_tests/backup.integration.test.mjs | `test("offline policy response body schema is complete")` |
| GET /api/v1/system/profile-fields | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs | `test("template discovery and persisted profile-field settings are operational")` |
| GET /api/v1/system/my-security-flags | yes | true no-mock HTTP | API_tests/security.integration.test.mjs | `test("self-scoped /system/my-security-flags remains available...")` |
| GET /api/v1/system/security-flags | yes | true no-mock HTTP | API_tests/security.integration.test.mjs | `test("global admin /system/security-flags supports filtering...")` |
| GET /api/v1/system/backup-status | yes | true no-mock HTTP | API_tests/backup.integration.test.mjs, API_tests/security.integration.test.mjs, e2e/tests/roles.test.mjs | `test("backup status response body schema is complete")` |
| PATCH /api/v1/system/profile-fields | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs | `test("template discovery and persisted profile-field settings are operational")` |
| POST /api/v1/system/profile-fields/custom | yes | true no-mock HTTP | API_tests/users.integration.test.mjs, e2e/tests/roles.test.mjs | `test("/api/v1/system/profile-fields/custom validates malformed payloads...")` |
| PATCH /api/v1/system/profile-fields/custom/:key | yes | true no-mock HTTP | API_tests/users.integration.test.mjs, e2e/tests/roles.test.mjs | `test("custom profile-field PATCH and DELETE full lifecycle")` |
| DELETE /api/v1/system/profile-fields/custom/:key | yes | true no-mock HTTP | API_tests/users.integration.test.mjs, e2e/tests/roles.test.mjs | `test("custom profile-field PATCH and DELETE full lifecycle")` |
| POST /api/v1/system/backup-run | yes | true no-mock HTTP | API_tests/backup.integration.test.mjs, API_tests/security.integration.test.mjs, e2e/tests/roles.test.mjs | `test("backup lifecycle, radius constraints...")` |
| GET /api/v1/system/backup-files | yes | true no-mock HTTP | API_tests/backup.integration.test.mjs | `test("backup restore round-trip...")` |
| POST /api/v1/system/backup-restore | yes | true no-mock HTTP | API_tests/backup.integration.test.mjs, e2e/tests/roles.test.mjs | `test("backup restore round-trip...")` |
| GET /api/v1/system/audit-immutability-check | yes | true no-mock HTTP | API_tests/mindtrack.integration.test.mjs, API_tests/backup.integration.test.mjs, e2e/tests/roles.test.mjs | `test("merge flow preserves audit immutability...")` |
| GET /api/v1/users | yes | true no-mock HTTP | API_tests/users.integration.test.mjs, API_tests/security.integration.test.mjs, e2e/tests/roles.test.mjs | `test("GET /users lists all users and is restricted to admin")` |
| POST /api/v1/users | yes | true no-mock HTTP | API_tests/users.integration.test.mjs, API_tests/auth.integration.test.mjs, e2e/tests/roles.test.mjs | `test("POST /users creates a new user...")` |
| POST /api/v1/users/:id/reset-password | yes | true no-mock HTTP | API_tests/users.integration.test.mjs, e2e/tests/roles.test.mjs | `test("POST /users creates a new user and POST /users/:id/reset-password...")` |

## API Test Classification
### 1) True No-Mock HTTP
- `repo/API_tests/auth.integration.test.mjs`
- `repo/API_tests/users.integration.test.mjs`
- `repo/API_tests/mindtrack.integration.test.mjs`
- `repo/API_tests/security.integration.test.mjs`
- `repo/API_tests/backup.integration.test.mjs`
- `repo/e2e/tests/roles.test.mjs`

Evidence basis:
- Real HTTP requests via `fetch(...)` to `BACKEND_BASE_URL`/`BASE`.
- No `jest.mock`, `vi.mock`, `sinon.stub` in API/E2E files.
- Requests exercise mounted route paths and middleware chain (`/api/v1` protected stack).

### 2) HTTP with Mocking
- None detected in API/E2E test sets.

### 3) Non-HTTP (unit/integration without HTTP)
- Backend unit tests in `repo/unit_tests/backend/*.mjs`.
- Frontend unit tests in `repo/unit_tests/frontend/*.mjs` and component tests in `repo/apps/frontend/src/__tests__/*.jsx`.

## Mock Detection
### API/E2E scope (for endpoint coverage)
- No mock/stub framework usage detected in `repo/API_tests/*.mjs` and `repo/e2e/tests/*.mjs`.

### Non-HTTP/unit scope (informational)
- Controller unit tests explicitly use stubs: `repo/unit_tests/backend/controllers.test.mjs` comment: "instantiated with stub services" and `makeAuthService(...)` factory.
- Frontend component tests use Vitest module mocks (not API tests), e.g.:
  - `repo/apps/frontend/src/__tests__/AdministratorModule.test.jsx` (`vi.mock` for API modules)
  - `repo/apps/frontend/src/__tests__/ClinicianModule.test.jsx` (`vi.mock`)
  - `repo/apps/frontend/src/__tests__/ClientModule.test.jsx` (`vi.mock`)
  - `repo/apps/frontend/src/__tests__/LoginPage.test.jsx` (`vi.mock`)
  - `repo/apps/frontend/src/__tests__/ProtectedPage.test.jsx` (`vi.mock`)

## Coverage Summary
- Total endpoints: **41**
- Endpoints with HTTP tests: **41**
- Endpoints with true no-mock HTTP tests: **41**
- HTTP coverage: **100.0%**
- True API coverage: **100.0%**

## Unit Test Analysis
### Backend Unit Tests
Files present: `repo/unit_tests/backend/*.mjs` (15 files).

Modules covered (evidence from file names and imports):
- Controllers: `controllers.test.mjs` (`AuthController`, `UserController`, `MindTrackController`, `SystemController`)
- Services:
  - `system_service.test.mjs`
  - `duplicate_idempotency_retention.test.mjs`
  - `idempotency_concurrency.test.mjs`
  - `merge_transaction_atomicity.test.mjs`
  - `restore_rollback_audit_immutability.test.mjs`
- Auth/guards/middleware:
  - `validation_lockout_rate_limit.test.mjs`
  - `nonce_replay_middleware.test.mjs`
  - `security_monitoring.test.mjs`
  - `app_factory_middleware.test.mjs`
  - `error_handler.test.mjs`
- Domain/safety logic:
  - `search_regex_safety.test.mjs`
  - `authorization_boundaries.test.mjs`
  - `auth_token_encryption.test.mjs`
  - `geo_utils.test.mjs`

Important backend modules with weak or no direct unit evidence:
- `ThirdPartyLoginService` direct unit tests not found.
- `AttachmentStorageService` direct unit tests not found.
- Concrete Mongo repositories lack dedicated unit tests (mostly covered through integration tests).

### Frontend Unit Tests (STRICT REQUIREMENT)
Detection rules check:
- Identifiable test files: yes (`repo/unit_tests/frontend/*.test.mjs`, `repo/apps/frontend/src/__tests__/*.test.jsx`).
- Frontend targets: yes (imports from `apps/frontend/src/...` helpers/components).
- Framework evidence: yes (`node:test`, Vitest via `apps/frontend/package.json`, React Testing Library imports in `apps/frontend/src/__tests__/*.jsx`).
- Imports/renders actual frontend modules/components: yes (`render(<LoginPage .../>)`, `render(<ClinicianModule .../>)`, utility imports from frontend source tree).

**Frontend unit tests: PRESENT**

Frontend files and tools detected:
- Node test runner: `repo/unit_tests/frontend/*.mjs`
- Vitest + RTL: `repo/apps/frontend/src/__tests__/*.jsx`, `repo/apps/frontend/package.json`

Frontend components/modules covered (examples):
- Components: `LoginPage`, `ProtectedPage`, `AppShell`, `AdministratorModule`, `ClinicianModule`, `ClientModule`, search/discovery views.
- App logic: `routePolicy`, `roleLogic`.
- Shared utilities: `passwordPolicy`, `searchHistory`, `attachmentRules`, `piiUtils`, `fileFingerprint`.

Important frontend components/modules with weak/no direct tests:
- API transport layer internals (request-signing plumbing in API client modules) are frequently mocked in component tests.
- Some integration of component + real API module behavior is deferred to E2E/API levels rather than direct frontend unit tests.

### Cross-Layer Observation
- Test distribution is balanced: backend unit/API integration + frontend unit/component + browser/E2E all present.
- No backend-heavy/frontend-untested imbalance detected.

## API Observability Check
Observed quality:
- Strong method/path visibility: test names and fetch URLs clearly identify endpoint intent.
- Strong request-input visibility: many tests include explicit `body`, query params, and trusted headers.
- Strong response visibility: many tests assert structured response fields (`data`, `code`, error contracts).

Weak spots:
- Some rate-limit/replay loops assert status outcomes with limited payload assertions (e.g., repeated request loops), reducing diagnostic granularity.

## Test Quality & Sufficiency
### Success Paths
- Covered across auth, users, mindtrack workflows, backup lifecycle, and governance.

### Failure Paths
- Covered for auth failures, signature failures, permission denial, validation failures, path traversal, missing idempotency, missing resources.

### Edge Cases
- Strong coverage for replay/idempotency, lockout/rate-limit, regex safety, legal hold blocking, restore rollback semantics.

### Auth/Permissions
- Extensive role boundary tests and 401/403/404 matrix checks.

### Integration Boundaries
- True HTTP integration against running stack in API tests/E2E tests.
- Browser checks exist (`e2e/tests/browser.test.mjs`).

### run_tests.sh boundary check
- Docker-based orchestration: **OK**.
- Local host dependency for runtime testing: **not required** for Node/npm/openssl (containerized execution). No hard violation.

## End-to-End Expectations
- Fullstack expectation: real FE↔BE testing should exist.
- Evidence: browser tests + roles E2E + frontend proxy verification are present.
- Compensation analysis not needed (expectation met).

## Tests Check
- Endpoint declaration and route mounting are explicit and traceable.
- API tests hit real HTTP endpoints with signed/unsigned behaviors validated.
- Unit tests cover substantial domain/security logic on both layers.

## Test Coverage Score (0–100)
**92/100**

## Score Rationale
- + Full endpoint inventory covered by true no-mock HTTP tests.
- + Strong security and negative-path depth.
- + Frontend and backend unit coverage both present.
- + FE↔BE E2E present.
- - Minor deduction for observability gaps in loop-style tests (status-focused assertions).
- - Minor deduction for some modules relying on integration coverage instead of direct unit tests.

## Key Gaps
1. Direct unit tests for `ThirdPartyLoginService` are not evident.
2. Direct unit tests for `AttachmentStorageService` are not evident.
3. Some high-volume loop tests prioritize status checks over richer response contract assertions.

## Confidence & Assumptions
- Confidence: high.
- Assumptions:
  - Static path/method mapping reflects runtime mounting exactly as coded.
  - No hidden runtime route registration outside inspected route/app files.

## Test Coverage Verdict
**PASS (strong, with minor engineering quality gaps).**

---

# README Audit

## Target and Existence
- Required path checked: `repo/README.md`.
- Status: present.

## Hard Gate Evaluation
### Formatting
- Clean markdown structure with sections, tables, and command blocks.
- Status: PASS.

### Startup Instructions (fullstack)
- Includes `docker-compose up --build` clearly.
- Status: PASS.

### Access Method
- Explicit URLs/ports for frontend, backend, and MongoDB.
- Status: PASS.

### Verification Method
- Includes manual UI verification flows and API verification snippets.
- Status: PASS.

### Environment Rules (strict Docker-contained)
- README explicitly states no host-side Node/openssl required for official flows.
- Commands are Docker/Compose-centric.
- Status: PASS.

### Demo Credentials (conditional auth)
- Auth exists; README includes credentials for all three roles (administrator/clinician/client).
- Status: PASS.

## Engineering Quality Review
Strengths:
- Clear stack description and layered architecture summary.
- Security model is explicit and detailed.
- Verification matrix and production handoff checklist are present.
- Testing section defines canonical execution boundary.

Defects:
- Inconsistency: section says `./run_tests.sh` runs "four families" while table enumerates five families.
- "Single startup command" heading contains two commands (`generate-secrets.sh` + compose up), reducing wording precision.

## High Priority Issues
- None.

## Medium Priority Issues
1. Test-family count inconsistency in README narrative (`four families` vs five listed families).

## Low Priority Issues
1. Wording precision issue: "Single startup command" heading describes a two-command first-time flow.

## Hard Gate Failures
- None.

## README Verdict
**PASS**

## README Final Verdict Rationale
- All strict hard gates pass for fullstack Docker-contained operation and role-based auth disclosure.
- Remaining defects are documentation consistency/clarity issues, not gate-breaking.

---

# Combined Final Verdicts
- Test Coverage Audit: **PASS (92/100)**
- README Audit: **PASS**
