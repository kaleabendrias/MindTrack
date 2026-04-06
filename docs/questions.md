Required Document Description: Business Logic Questions Log:

## 1. Offline mode vs third-party login endpoint
Question: Prompt requires a fully offline, on-prem system and says third-party login should be disabled/extensible, but does not define whether the endpoint should be absent or callable as a stub.

My Understanding: External identity providers must not be used, but a local stub endpoint can exist to show the extension point while offline policy stays enforced.

Solution: Kept a local third-party login route interface and enforced offline policy metadata showing external integrations/network are disabled.

## 2. Request-signing boundary for authenticated routes
Question: Prompt states API requests require authentication plus HMAC signing, but does not explicitly clarify whether session-check endpoints are included in the signing boundary.

My Understanding: High-risk and domain API calls should be signed; authentication/session bootstrap paths can be treated as a narrower boundary if explicitly controlled.

Solution: Applied global signed middleware to protected /api/v1 routes while keeping auth-specific routes mounted separately, with session authentication still required.

## 3. Password recovery flow shape in offline deployment
Question: Prompt allows administrator reset or security questions but does not specify whether username lookup can return security-question text before answer verification.

My Understanding: Recovery questions are part of local-only recovery UX, and the answer must still be validated before password reset.

Solution: Implemented recovery by username + selected question + answer, plus recovery rate limiting and lockout counters aligned with login risk controls.

## 4. PII response masking granularity
Question: Prompt gives a phone masking example and explicit PII permission, but does not prescribe exact masking format for all sensitive fields.

My Understanding: Phone should reveal only the last 4 digits, and address should be fully masked unless PII View permission is present.

Solution: Implemented permission-gated sanitization: phone masked to last-4 and address returned as masked token by default.

## 5. Duplicate detection threshold and merge authority
Question: Prompt requires weighted duplicate detection using name, DOB, and phone last-4, but does not define the match threshold or who can override collisions.

My Understanding: Use a deterministic score threshold and require administrator oversight when duplicates are detected.

Solution: Implemented weighted duplicate scoring with a fixed threshold and administrator-only merge flow with audit logging.

## 6. Data deletion model for clinical timeline entries
Question: Prompt requires immutable operation logs and retention/legal-hold controls but does not explicitly say whether entry deletion must be hard delete or soft delete.

My Understanding: Clinical records should use soft delete so history, retention, and restore remain auditable.

Solution: Added soft-delete fields (deletedAt/deletedReason), restore flow, and audit events for delete/restore operations.

# 7. Legal hold enforcement scope
Question: Prompt states legal holds are administrator-controlled but does not enumerate every operation that must be blocked while hold is active.

My Understanding: Any record mutation that changes client or entry state must be blocked under legal hold/retention constraints.

Solution: Added mutation guards in service-layer flows for create/update/sign/amend/delete/restore/merge/governance-sensitive paths.

## 8. Search suggestion and trending scope on shared devices
Question: Prompt asks for local recent-search suggestions, 7-day trending terms, and one-click clear history, but does not define whether this is per user or device-wide.

My Understanding: Suggestions and trending should be user-context aware to avoid cross-user leakage on shared kiosks.

Solution: Implemented user-keyed local recent history and backend trending terms derived from each user's last 7 days of search events.

# 9. Attachment duplicate prevention mechanism
Question: Prompt requires local fingerprint-based duplicate prevention but does not define when duplicate validation should happen (UI-only, API-only, or both).

My Understanding: Duplicate protection should be defense-in-depth across client and server validation.

Solution: Implemented frontend fingerprint computation and duplicate blocking in uploader logic, plus backend attachment validation for type/size/count/fingerprint uniqueness.

## 10. Geospatial fallback behavior without external maps
Question: Prompt requires address parsing, known coordinates, ZIP-centroid correction, and radius search, but does not define fallback priority and radius constraints.

My Understanding: Prefer stored/verified client coordinate, otherwise derive from ZIP centroid; use a safe bounded radius.

Solution: Implemented local US address parsing, ZIP-centroid fallback, default 25-mile nearby search, and hard maximum radius of 100 miles.

## 11. Client self-service entry lifecycle status
Question: Prompt says clients complete self-assessments and clinicians manage timeline statuses, but does not specify whether client-submitted assessments start as Draft or Signed.

My Understanding: Client self-assessment should be finalized at submission to avoid unsigned self-service artifacts.

Solution: Implemented client-created assessment entries with self_service channel and auto-signed status, while clinician/admin entries retain lifecycle transitions.

## 12. Critical-write idempotency scope
Question: Prompt names signing, merges, and restores as critical idempotent writes, but does not define whether additional mutations should also require idempotency.

My Understanding: At minimum, enforce idempotency on explicitly critical writes and extend to other high-risk mutation flows where practical.

Solution: Implemented idempotency enforcement for merge/sign/amend/delete/restore and backup restore operations using client-provided idempotency keys.
