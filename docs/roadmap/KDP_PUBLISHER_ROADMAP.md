# KDP Publisher roadmap

## Phase 1 — Audit and foundation (this change)

Reuse the existing adapter and all 35 tool registrations. Add typed config, private HTTP defaults, structured redacted diagnostics, secret-safe tool errors/results, writable data probe, Compose storage/security, mock fixtures, focused tests and CI container build. Architecture/security documents identify unfinished capabilities. No automatic publication or deployment.

## Phase 2 — Persistent owner catalog, drafts and approval

Select SQLite driver compatible with supported Node versions; migrations, repository interfaces, WAL/foreign keys/busy timeout, transactional tests, backup/restore. Add books/series/authors/Amazon marketplace URLs, campaigns, board references, assets and versioned English drafts. Validate local image uploads by signature/MIME/dimensions/size; validate external media URLs without unsafe fetching. Add owner-authorized MCP catalog/draft/review tools; explicit approval records exact payload hash/version. Editing invalidates approval transactionally. No paid AI dependency.

Exit: restart persistence, foreign keys, CRUD validation, approval invalidation/concurrency and malicious asset cases covered by offline tests. Owner can prepare/review a complete campaign without Pinterest access.

## Phase 3 — Identity and credentials hardening

Resolve all remote-use High findings: single-owner authentication, separate raw/sealed modes, browser-bound OAuth state, persistent single-use codes, strict client/redirect binding, encrypted credential storage with external keys, refresh rotation/revocation, least-privilege scopes, registration allowlist/abuse limits. Review direct raw/write tools to ensure they cannot bypass publisher approvals in unattended mode. Mock tests for cross-client/restart/replay attacks; scan secrets and dependencies.

Exit: no shared token fallback, no credential exposure, owner isolation and persistent OAuth state verified. Independent security review before any public hosting. Public deployment is not authorized by this task.

## Phase 4 — Durable scheduler and publishing worker

SQLite-backed jobs, leases, unique idempotency keys, UTC due times with original IANA zone (Asia/Ho_Chi_Minh default), DST ambiguity handling, cancellation, missed-run policy, bounded retries/jitter and error history. Worker is a separate executable/service independent of ChatGPT. Approval/version/scope checks at claim and immediately before send; no write retry after ambiguous response. Reconcile unknown outcomes and store Pin IDs/attempts atomically where locally possible.

Exit: fake-clock crash/restart, overlapping claims, expired leases, cancellation races, 401/403/429/5xx and ambiguous outcomes tested using mocks. No real publication until Trial Access approval, scope authorization and a separately authorized owner-approved smoke test. External queue only if measured scaling requires it.

## Phase 5 — Analytics and operational readiness

Authorized analytics snapshots linked to drafts/books/campaigns; permission-aware tools and provider-window validation. Metrics, sanitized logs, backup/restore rehearsal, retention, operator recovery runbook, dependency/container scans and private deployment review. Optional content-assistance provider only on explicit opt-in; no assumption that ChatGPT Plus grants API access or background execution.

Exit: agreed monitoring/recovery objectives met; analytics gracefully handles unauthorized scopes. Real publishing requires explicit owner approval for every payload and rollout authorization.
