# Questions and Clarifications

This file records open questions and assumptions discovered while documenting the repository.

## Open Questions
1. Third-party login behavior is exposed at POST /api/v1/auth/third-party, but the deployment goal is fully offline operation. Should this endpoint remain enabled in production, or should it be disabled/feature-flagged for on-prem installs?
	Current implementation in code: the endpoint is wired and callable, while offline policy endpoints report external integrations/network as disabled. There is no explicit feature flag to disable this route per environment.
2. The API tests enforce idempotency on merge and entry lifecycle critical writes. Should idempotency be standardized for all mutating endpoints, or only the currently designated critical routes?
	Current implementation in code: idempotency is applied to critical write paths (for example merge and signed entry lifecycle actions), and integration tests verify replay behavior for repeated keys.
3. Profile-field configuration is mutable via system endpoints. Should field-level visibility settings be role-specific profiles, or global for the whole deployment?
	Current implementation in code: profile field settings are managed through system-level read/update endpoints and behave as shared deployment-level configuration, not per-role profiles.
4. Backup run is manually triggerable by privileged users. Is there a requirement for dual-approval or reason-code validation before backup execution in regulated environments?
	Current implementation in code: backup execution is permission-gated and available via a direct system endpoint call; there is no dual-approval workflow implemented today.

## Working Assumptions Used in Current Docs
1. Docker Compose is the only supported production runtime entrypoint.
2. MongoDB is the only persistence engine in this codebase.
3. API versioning is currently fixed at /api/v1.
4. Sessions folder and conversation artifacts are managed outside this repository setup step.
