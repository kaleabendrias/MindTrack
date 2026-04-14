# Audit Report 2 Fix Check (Static-Only)

Source baseline: .tmp/audit_report-2.md
Scope: verify whether each listed issue in audit_report-2.md is fixed in the current repository snapshot using static evidence only.

## Overall Fix Check Verdict
- Result: All previously listed issues are fixed in the current static snapshot.
- Fixed count: 4 / 4
- Remaining from prior list: 0

## Issue-by-Issue Status

### 1) High — Unauthenticated security-question endpoint enables username enumeration
- Previous status in audit_report-2.md: Not fixed (High)
- Current status: Fixed
- Why:
  - `getSecurityQuestions` now always returns a single generic label and no longer returns user-specific configured question text.
  - Integration tests were updated to assert identical generic responses for real/fake/empty usernames.
- Evidence:
  - repo/apps/backend/src/application/services/AuthService.js:325
  - repo/apps/backend/src/application/services/AuthService.js:333
  - repo/API_tests/mindtrack_api.integration.test.mjs:856
  - repo/API_tests/mindtrack_api.integration.test.mjs:872
  - repo/API_tests/mindtrack_api.integration.test.mjs:894

### 2) Medium — Frontend tests did not directly cover login recovery UI contract behavior
- Previous status in audit_report-2.md: Not fixed (Medium)
- Current status: Fixed
- Why:
  - A dedicated frontend test file now validates recovery outcome messaging behavior for `reset: true` and `reset: false`, including safe defaults and related flow guards.
- Evidence:
  - repo/unit_tests/frontend/login_recovery.test.mjs:6
  - repo/unit_tests/frontend/login_recovery.test.mjs:67
  - repo/unit_tests/frontend/login_recovery.test.mjs:73
  - repo/unit_tests/frontend/login_recovery.test.mjs:82

### 3) Medium — US address parsing was minimal (ZIP extraction only)
- Previous status in audit_report-2.md: Not fixed (Medium)
- Current status: Fixed
- Why:
  - Address parser now extracts/normalizes additional components (`street`, `city`, `state`) and validates state codes.
  - Unit tests were expanded to cover normalization and malformed/partial inputs.
- Evidence:
  - repo/apps/backend/src/application/geo/geoUtils.js:24
  - repo/apps/backend/src/application/geo/geoUtils.js:29
  - repo/apps/backend/src/application/geo/geoUtils.js:63
  - repo/unit_tests/backend/geo_utils.test.mjs:64
  - repo/unit_tests/backend/geo_utils.test.mjs:89
  - repo/unit_tests/backend/geo_utils.test.mjs:113

### 4) Low — Public health endpoint exposure lacked explicit security-posture documentation
- Previous status in audit_report-2.md: Not fixed (Low)
- Current status: Fixed
- Why:
  - Design documentation now explicitly justifies public `/healthz` exposure, scope of returned data, operational necessity, and network-level restriction guidance.
- Evidence:
  - docs/design.md:91
  - repo/apps/backend/src/interfaces/http/routes/healthRoutes.js:6

## Final Notes
- This is a static-only fix verification; no runtime execution was performed.
- This report only checks closure of the issues listed in `.tmp/audit_report-2.md`; it does not claim that no other issues exist outside that prior issue set.
