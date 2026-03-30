# MindTrack Offline On-Prem Repository

Fully offline outpatient mental-health package with a React frontend, Node/Express backend, and MongoDB, designed to run on-prem with Docker Compose as the only runtime entrypoint.

## Single startup command

```bash
docker compose up --build
```

## Local frontend verification commands

These commands are for developer-only UI verification outside the production runtime path. Docker Compose remains the only supported production runtime entrypoint.

```bash
cd apps/frontend
npm install
npm run dev
```

Build and preview locally:

```bash
cd apps/frontend
npm run build
npm run preview
```

## Exposed ports

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000`
- MongoDB: `mongodb://localhost:27017`

## Services

- `frontend`: React application served by Nginx
- `backend`: Express API for auth, workflows, search, governance, and backups
- `mongodb`: MongoDB persistence
- `mongo-seed`: deterministic seed/bootstrap job
- `test-runner`: in-stack test execution service

## Local-only operation

- No external APIs are called
- No third-party login integrations are enabled
- No `.env` files are required for default runtime
- Runtime behavior is containerized; there is no hidden dependency on host system libraries beyond Docker/Compose

## Layered architecture

- HTTP interfaces: `apps/backend/src/interfaces/http`
- Application services: `apps/backend/src/application/services`
- Repositories/persistence: `apps/backend/src/infrastructure/repositories`, `apps/backend/src/infrastructure/persistence`

## Bootstrap flow and default credentials

`mongo-seed` runs automatically after MongoDB is healthy and before backend startup.

Seeded users:

- Administrator
  - username: `administrator`
  - password: `AdminPasscode2026`
- Clinician
  - username: `clinician`
  - password: `ClinicianPass2026`
- Client
  - username: `client`
  - password: `ClientPasscode2026`

Default seeded clinician identifier for administrator client assignment:

- `0000000000000000000000b1` (`clinician`)

## Security model

- Access and refresh tokens are issued server-side and stored in HTTP-only cookies for browser use
- Browser-visible auth state is memory-only; no access token, refresh token, or signing secret is stored in local storage
- Protected authenticated requests use active HMAC request signing with:
  - timestamp
  - nonce
  - method
  - path
  - body
- Mutating authenticated requests also use server-trusted CSRF + nonce as defense-in-depth:
  - `x-csrf-token`
  - `x-request-nonce`
- Critical writes additionally require `x-idempotency-key`
- Per-session HMAC signing keys are derived server-side from secure local signing configuration and are never stored in browser persistence
- Account lockout: 5 failed logins triggers 15-minute lock
- Session rate limit: 60 requests/minute
- PII is encrypted at rest and masked by default unless `PII_VIEW` permission exists

## Object-level authorization and isolation

- Administrator: full access
- Clinician: only clients assigned to that clinician and their related timeline/search/recommendation context
- Client: only their own record context
- Backend query filters enforce this isolation
- Frontend rendering follows the same role boundary:
  - Client users never see generic client selectors
  - Client users only receive and render self-context

## Data governance

- MindTrack client `phone` and `address` are encrypted at rest
- Audit logs are immutable and record who/when/what/why for CUD operations
- Nightly encrypted local backups are written to `/var/lib/offline-system/backups`
- Backup retention: 30 days
- Record retention policy: 7 years metadata on MindTrack clients/entries
- Legal hold blocks mutation paths including sign, amend, restore, merge, and critical idempotent writes

## Search semantics

Discovery filters align to workflow types:

- `assessment`
- `counseling_note`
- `follow_up`

Also supported:

- date filters
- tag filters
- sort by `relevance` or `newest`
- local recent-query suggestions
- 7-day trending terms
- one-click local history clear

## Verification steps

### 1. Start the stack

```bash
docker compose up --build
```

### 2. Confirm health

```bash
docker compose ps
```

Expected: `frontend`, `backend`, and `mongodb` are healthy. `mongo-seed` exits successfully.

### 3. Verify login

1. Open `http://localhost:3000`
2. Sign in with one of the seeded roles
3. Confirm the shell shows the authenticated username and role

### 4. Verify role-specific behavior

Client:

1. Sign in as `client`
2. Confirm there is no client selector
3. Confirm self-only context is shown
4. Confirm upcoming follow-up plan is visible when present
5. Submit a self-assessment and verify save feedback and timeline refresh
6. Logout and confirm client state is cleared

Clinician:

1. Sign in as `clinician`
2. Select an assigned client
3. Create a new timeline entry with inline validation
4. Confirm reverse-chronological timeline order
5. Use `Sign`, `Amend`, and `Restore`
6. Confirm visual cues for `draft`, `signed`, and `amended`
7. Confirm failures surface clear inline feedback

Administrator:

1. Sign in as `administrator`
2. Create a new client and provide a valid `primaryClinicianId`
3. Trigger duplicate detection by using a similar name/DOB/phone last-4
4. Complete merge oversight flow
5. Open governance controls and update legal hold / retention settings
6. Open backup panel and run a backup

### 5. Verify attachment handling

On clinician entry form:

1. Upload PDF/JPG/PNG files through drag-drop or file picker
2. Confirm type/size display is visible
3. Confirm each attachment row visibly shows fingerprint metadata
3. Confirm files over 10 MB are rejected
4. Confirm more than 20 files are rejected
5. Upload the same file twice and confirm fingerprint duplicate prevention

### 6. Verify search, trending, and local history clear

1. Search using free text
2. Filter by workflow type (`assessment`, `counseling_note`, `follow_up`)
3. Filter by date and tags
4. Switch sort between `relevance` and `newest`
5. Confirm recent-query suggestions appear
6. Confirm `Clear history` removes local history
7. Confirm switching users does not reveal prior user search terms
8. Confirm 7-day trending terms display for the current user context

### 7. Verify signed/trusted critical writes

Browser clients do not carry a shared global signing secret.

Instead, trusted mutating requests are protected by:

- authenticated session cookies
- server-issued per-session HMAC signing key held in memory only
- active HMAC request signature headers
- server-issued CSRF token
- per-request nonce
- idempotency key for critical write endpoints

Critical endpoints include:

- sign
- amend
- restore
- merge
- backup run

### 8. Verify backups, retention, and legal hold

Available governance endpoints:

- `GET /api/v1/system/backup-status`
- `POST /api/v1/system/backup-run`
- `GET /api/v1/system/offline-policy`
- `GET /api/v1/system/audit-immutability-check`

Expected behavior:

- backup schedule is nightly (`0 0 * * *`)
- backup files are encrypted and retained for 30 days
- record retention metadata is 7 years
- legal hold blocks mutation attempts on governed records

## Testing

Mandatory root test directories:

- `unit_tests`
- `API_tests`

Run all suites with one command:

```bash
./run_tests.sh
```

This command:

- starts the stack in containers
- runs backend unit tests
- runs frontend unit tests
- runs API/integration tests
- exits nonzero on failure

The automated suites target the high-risk acceptance surface of the prompt, including role flows, auth/security boundaries, validation/error paths, search/filter/sort/trending/history clear, attachment constraints and dedupe, governance/retention/backup lifecycle, and critical-write idempotency.

## Verification matrix

| Requirement | Implementation | Verification/Test |
| --- | --- | --- |
| Docker Compose only runtime | `docker-compose.yml` | `docker compose up --build` |
| Offline/on-prem only | `/api/v1/system/offline-policy`, disabled third-party auth | API test: offline policy |
| Layered backend separation | `interfaces/http`, `application/services`, `infrastructure/repositories` | code structure + runtime pass |
| Active HMAC on protected routes | `requestSigningMiddleware.js`, `requestSigner.js`, in-memory session signing key | API tests: good/bad signature |
| CSRF + nonce defense-in-depth | `requestSigningMiddleware.js`, frontend `api/client.js` | API tests: missing trusted headers |
| No insecure fallback secrets | `config/index.js` hard-fails on missing/weak secrets | startup + test harness explicit env |
| Privacy-safe logs | custom morgan formatter in `appFactory.js` | runtime logging behavior |
| Strict role/object isolation | `MindTrackService.resolveClientAccess`, filtered repository access | API tests: client self-only, clinician scoped |
| Admin client ownership assignment validation | `validateCreateClient`, `MindTrackService.createClient` | API test: missing/invalid `primaryClinicianId` |
| Encrypted-at-rest + masked-default PII | client schema encryption + service sanitization | unit + API PII tests |
| Immutable audit logs | audit schema hooks + service logging | API test: audit immutability check |
| Idempotent critical writes | `IdempotencyService`, merge/sign/amend/restore flows | unit + API replay tests |
| Transaction-safe merge with rollback | Mongo replica set + `mergeClientTransactional` + transaction wrapper | backend unit + API merge test |
| Legal hold + retention policy | `RetentionService`, MindTrack mutation guards | unit + API retention tests |
| Nightly encrypted local backups + 30-day retention | `SystemService` | API backup lifecycle tests |
| Client self-context flow | `ClientModule`, `/mindtrack/self-context` | API + UI verification steps |
| Clinician timeline flow | `ClinicianModule`, timeline/search endpoints | API + manual clinician verification |
| Administrator governance/profile fields | `SystemService` settings + `AdministratorModule` | API profile field settings test + manual admin verification |
| Attachment fingerprint visible | `AttachmentUploader.jsx` | manual UI verification |
| Template discovery | template model/repo/search + frontend template results | API test: template discovery |
| Search filters/sort/trending/history clear | search service + `SearchPanel.jsx` | unit + manual verification |
| User-scoped recent search isolation | `recentSearchStorageKey`, user-keyed search history storage | frontend unit test |
| Secure session reset on logout/user switch | frontend in-memory session state + logout reset | frontend unit session isolation + manual verification |

## Production handoff checklist

1. `docker compose up --build`
2. `docker compose ps`
3. `./run_tests.sh`
4. Verify login for all three roles
5. Verify timeline, attachment, search, governance, and backup flows in UI
6. Confirm offline-only policy endpoint reports no external network/integrations
