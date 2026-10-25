# KDP Pinterest Publisher architecture — Phase 1

Status: foundation only. No catalog, database schema, approval engine, scheduler or worker is implemented. No live Pinterest call is needed for tests. Trial Access is pending according to the owner; no attempt was made to bypass permissions.

## Existing repository audit

Baseline: 6cc45f2, MIT, original author aymandakirgh. Keep LICENSE and upstream package attribution. The TypeScript ESM package targets Node >=20 with strict compilation and uses Express 5, MCP SDK and Zod. There is no frontend, database, queue, AI provider or persistence layer.

- src/index.ts: stdio transport; one server per process; protocol stdout remains reserved.
- src/http.ts: stateless Streamable HTTP; one server/client per POST; health, browser OAuth and authorization server mounted together. Previously trusted all proxies and allowed anonymous server-token fallback. Foundation removes both defaults.
- src/server.ts: composition root; reuse registration and per-request client construction.
- src/client.ts: shared bearer authentication, query serialization, JSON/error parsing, pagination parameters and retry. Reuse adapter; add timeout/redirect protection and restrict automatic retries to reads. No background token refresh.
- src/tools/shared.ts: reusable schemas/result wrappers; provider error bodies are no longer exposed and credential fields are redacted from successful results.
- src/auth/tokens.ts: purpose-separated HKDF/AES-GCM envelopes and in-memory spent-code protection. Reuse cryptographic primitives, replace ephemeral identity/replay state with persistent owner sessions before remote use.
- src/auth/router.ts: OAuth metadata, dynamic registration, authorization, Pinterest callback, code redemption and refresh. S256 is enforced between MCP client and this server; upstream Pinterest exchange uses app credentials. Foundation tightens redirect validation and makes callback state single use per process.
- src/oauth-web.ts: local credential bootstrap; signed state now expires after ten minutes and is single use per process. Raw credentials are intentionally visible on the local success page; do not expose this route publicly.
- Existing tests cover client requests, 429/500 retries, stdio handshake/schema validation, envelope isolation, OAuth registration/code/PKCE/replay and browser failure pages. They use fake tokens, injected fetch or loopback HTTP stubs. They do not cover every tool's live API semantics.
- Dockerfile already uses two stages, Node Alpine and a non-root user. Foundation adds writable data ownership and preserves LICENSE in the runtime. Compose adds loopback exposure, named storage, read-only root filesystem and readiness probe.
- CI already installs, typechecks, builds and tests Node 20/22. Foundation keeps those checks and adds Docker build and read-only repository permissions. Release workflow stages npm publication using OIDC and requires registry approval; unchanged and not executed.

## Complete existing tool inventory (35)

| Module | Tools | Reuse / future changes |
|---|---|---|
| account (9) | pinterest_get_user_account, pinterest_get_user_analytics, pinterest_get_top_pins, pinterest_get_top_video_pins, pinterest_get_pin_analytics, pinterest_get_multi_pin_analytics, pinterest_list_followers, pinterest_list_following, pinterest_list_claimed_websites | Keep; later associate analytics snapshots with published drafts; permissions determine availability. |
| boards (11) | pinterest_list_boards, pinterest_get_board, pinterest_create_board, pinterest_update_board, pinterest_delete_board, pinterest_list_board_pins, pinterest_list_board_sections, pinterest_create_board_section, pinterest_update_board_section, pinterest_delete_board_section, pinterest_list_board_section_pins | Keep; later validate owner board references. |
| pins (9) | pinterest_list_pins, pinterest_get_pin, pinterest_create_pin, pinterest_update_pin, pinterest_delete_pin, pinterest_save_pin, pinterest_register_media, pinterest_get_media, pinterest_list_media | Keep schemas; later publisher calls adapter through approval service. Direct tools remain manual operations, never scheduled by Phase 1. |
| search (2) | pinterest_search_my_pins, pinterest_search_my_boards | Keep owner-scoped searches. |
| raw (1) | pinterest_api_request | Keep relative API escape hatch for compatibility; exclude from future automatic publishing orchestration. |
| oauth (3) | pinterest_build_oauth_url, pinterest_exchange_oauth_code, pinterest_refresh_access_token | Names/inputs retained. Credential values are now redacted in MCP responses; use local browser bootstrap. This intentional security restriction changes token-return behavior. |

## Proposed modules and ownership

```text
MCP client (user-supplied English content and explicit approval)
    -> Tool layer -> Owner authorization -> Application services
        -> BookCatalog / Campaigns / Drafts / Approval
        -> Repository interfaces -> SQLite on persistent volume
Independent scheduler process -> durable job claims -> Publishing worker
    -> approval/version/capability checks -> existing Pinterest adapter
    -> publishing attempts / Pin IDs / analytics snapshots
```

A single owner needs SQLite, not Redis or an external queue. Use repository interfaces with transactional operations rather than exposing SQL to tools. Choose a maintained SQLite driver compatible with Node 20/22 in Phase 2; no driver is installed prematurely. Enable foreign keys, WAL, busy timeout, versioned migrations and online backups. Place assets and database under DATA_DIR; keep encryption keys outside database/backups. One writable deployment and one worker initially. Re-evaluate an external queue only for multiple instances or measured throughput needs.

Proposed entities: authors; series; books (ASIN, marketplace, canonical Amazon product URL and series/author foreign keys); campaigns; boards; assets (MIME, byte size, hash, origin); versioned pin_drafts (English title/description/keywords/destination); approvals (owner, timestamp, exact content hash/version); jobs (UTC due time, original IANA zone/local time, unique idempotency key, lease); publish_attempts (sanitized errors, request hash, provider ID, timestamps); analytics_snapshots; encrypted owner_connections. These are design contracts, not existing tables.

## Approval, scheduling and duplicates

Draft -> in_review -> approved -> scheduled -> publishing -> published. Edits invalidate approval and cancel/revise jobs transactionally. Also support rejected, cancelled, retry_wait and needs_reconciliation. Scheduling stores a UTC instant plus source zone (default Asia/Ho_Chi_Minh); reject ambiguous/nonexistent local times unless the owner explicitly selects an offset. The scheduler runs independently of ChatGPT and recovers overdue jobs after restarts.

Use SQLite transactions and conditional version checks to claim due jobs with bounded leases. A unique draft-version/job idempotency key prevents duplicate local submissions. Immediately before send, recheck approval, payload hash, cancellation, credentials and scope. Record attempt before network I/O and provider Pin ID after success. An interrupted/timeout write is ambiguous: never blindly retry; mark needs_reconciliation. Exactly-once delivery cannot be promised across SQLite and an external API without provider support. Reconcile manually if the provider cannot identify the original operation. Reads may retry with bounded backoff; queue retries need explicit error classification, jitter, budgets and persisted next-attempt time.

## Media and secrets boundary

Phase 1 does not fetch arbitrary image URLs locally; existing tool schemas forward URLs to Pinterest. Phase 2 validates uploads by byte signature, actual MIME, dimensions and size (initial JPEG/PNG/GIF set follows existing schemas, subject to API verification). For externally hosted assets, prefer an owner-controlled host allowlist. If adding server-side fetching, block private/reserved IPv4/IPv6 and metadata ranges after DNS resolution, pin the connection to the validated address, reject redirects, limit response time/bytes and verify decoded images. Do not claim URL syntax alone prevents SSRF. Amazon destination links need marketplace allowlists and must never become arbitrary server fetches.

No paid AI API is required. ChatGPT or the owner supplies text and image assets; ChatGPT Plus is not a worker or image-generation API entitlement. No publication without approved persisted payloads. Future KDP tools call application services, not raw Pinterest write tools. Existing low-level tools preserve manual compatibility but are not an approval enforcement boundary.

## Local operations

Run npm ci, npm run typecheck, npm run build, npm test. For stdio use npm start. HTTP defaults to 127.0.0.1:3000; send a caller Pinterest bearer token or a server-issued OAuth bearer. PINTEREST_ACCESS_TOKEN is never an anonymous HTTP fallback. Raw token mode remains for local compatibility; remote owner restriction is a future gate.

Copy .env.example to .env, set a random MCP_AUTH_SECRET of at least 32 characters, set PUBLIC_BASE_URL=http://127.0.0.1:3000 and leave Pinterest app credentials empty for offline foundation use. Compose explicitly passes environment; it does not expose a default Pinterest token. Run docker compose up --build -d, docker compose logs and docker compose down. The named publisher-data volume survives down; do not use down -v unless intentionally deleting data. /health reports process liveness; /ready checks storage writability as the runtime user, without Pinterest network calls. Neither probe certifies API permission, database schema or worker readiness. SQLite migrations and backup/restore verification arrive in Phase 2.

Production mode fails closed without a stable auth secret and configured origin. Compose exposes loopback only; do not publicly deploy this phase. Keep .env out of Git and apply OS file permissions. No worker or automated publication is enabled.
