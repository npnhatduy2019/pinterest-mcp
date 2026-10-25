# Phase 1 security review

Review scope: all tracked source, tools, tests, Docker/ignore files and CI/release workflows at baseline 6cc45f2 plus foundation changes. Static review and mock tests are not a penetration test. No real credentials, API permission checks or public deployment were used.

| Severity | Finding | Phase 1 treatment / residual risk |
|---|---|---|
| Critical | Anonymous HTTP requests inherited PINTEREST_ACCESS_TOKEN, enabling owner actions without authentication. | Fixed: missing caller credentials return 401 even with server token configured. Regression test added. |
| High | OAuth exchange/refresh tools and raw provider errors exposed credentials to MCP clients. | Successful result keys are recursively redacted; provider error bodies and generic unexpected errors suppressed. Token tools retain names/inputs but no longer return usable credentials. Local browser bootstrap intentionally shows credentials to the local owner; HTTP responses disable caching/referrers. |
| High | Writes retried after network errors/5xx, potentially creating duplicates. | Fixed adapter policy: only GET retries automatically. Ambiguous writes require reconciliation in future worker. No distributed exactly-once guarantee. |
| High | Raw bearer tokens and x-pinterest-access-token are accepted as caller-owned Pinterest credentials, rather than proving a specific owner identity; invalid encrypted tokens can fall through as raw tokens. | Compatibility retained for local-only use. No shared-token fallback. Remote owner identity/session enforcement and distinguishing sealed/raw token modes are mandatory before public deployment. |
| High | No durable approval gate around direct create/save/raw tools. | Existing manual tools retained; Phase 1 has no scheduler or automatic publication. Future publisher tools must gate immutable payload approval and restrict raw/manual capabilities. This is a blocker for unattended use, not an implemented workflow. |
| High | OAuth signed state lacked expiry/replay protection in browser flow; callback state in authorization server could replay. | Browser states now have ten-minute process-local TTL, bounded pending map and single use. Authorization callback states are claimed once per process. Browser binding cookies are still missing in both flows: signed state alone is not full login-CSRF protection. Must add Secure/HttpOnly/SameSite browser binding before remote use. |
| High | Authorization code redemption replay state is memory-only; refresh tokens not rotated/revoked locally. | Documented unresolved: restart with stable key resets spent codes. Add persistent session/code state and refresh rotation/revocation before remote service. |
| Medium | Dynamic registration redirect validation allowed exotic loopback schemes; loopback matching ignored scheme/host/query. | Fixed: HTTP/HTTPS only, no userinfo/fragments; loopback exception varies only port with scheme, hostname, path and query preserved. Registered HTTPS callbacks still do not prove a trusted owner/client; future allowlist required. |
| Medium | Trusting all proxies and request Host could poison OAuth origin. | Fixed defaults: explicit PUBLIC_BASE_URL required in production, loopback fallback otherwise, proxy trust disabled; browser flow uses validated configured origin. |
| Medium | Config accepted invalid numbers, arbitrary API origins and weak auth secret silently. | Typed parsing rejects invalid port/retries/timezone/URL/boolean/short secrets. Production requires stable secret and origin. Loopback mock origins remain allowed; operator controls environment. |
| Medium | Fetch followed redirects with authorization and lacked timeout. | Adapter and all OAuth token exchanges reject redirects and use 30-second timeouts. Raw relative API tool never independently fetches arbitrary media URLs. |
| Medium | Rate-limit retries accepted negative delay and ignored HTTP-date Retry-After. | Clamp read delays to 0..30 seconds and support dates. Only GET retries. There is no jitter or global shared rate budget yet; worker must persist retry budgets and long provider delays rather than early repeated calls. |
| Medium | Media URL schemas validate syntax only. | No local fetch/upload proxy exists, so no current local media-fetch SSRF sink was found. Pinterest receives media URLs. Do not infer third-party fetch safety. Content MIME/magic-byte checks, private address/redirect/DNS-rebinding protections and raw-tool restrictions remain Phase 2 requirements. |
| Medium | OAuth helper URL tool state is optional, and PKCE is only between MCP client and server. | No upstream PKCE capability assumed or implemented. Tool clients must manage their own state. Validate current Pinterest requirements before changing upstream exchange. Public-client redemption parameters are partially optional; tighten with migration tests in OAuth hardening phase. |
| Medium | Public metadata/registration and OAuth routes have no abuse limits; envelope replay map is unbounded within TTL. | Loopback-only deployment. Browser pending states capped; registration rate limits, body size review and persistent replay quotas remain required before public exposure. |
| Low | Container writable root, weak operational probes and secret/data ignore coverage. | Compose read-only root, non-root runtime, dropped capabilities, loopback mapping, data mount and storage readiness. Environment variants, DB files and secret directories excluded from Git and Docker context. Existing historical Git secrets were not scanned with a specialist secret scanner. |

## Explicit verification boundaries

- Existing AES-256-GCM envelopes use purpose-separated HKDF keys, authenticated expiry and tamper rejection. Existing mock tests cover wrong-key/purpose, expiration, tampering, PKCE mismatch and redeemed code replay.
- State remains process-local and is not browser-bound. Do not claim complete OAuth 2.1 compliance or production readiness.
- MCP logs omit raw exceptions/request bodies. Redaction is defense in depth, not permission to log arbitrary data; unlabelled credential strings supplied by upstream are not universally identifiable. Known environment secret values and credential fields are scrubbed.
- Direct Pinterest credentials remain allowed on local HTTP by explicit caller input; a server default credential never authenticates an anonymous request. No public unauthenticated MCP endpoint was introduced.
- No live access or analytics scopes were verified. 401/403 are surfaced, never bypassed. No Pins were published.
- npm dependency audit and Docker validation results are recorded in PHASE1_REPORT.md; unresolved dependency advisories, if any, require separate review.
- MIT license, upstream author and release attribution remain intact. No secrets were intentionally added. No main-branch changes, deployment or merge was performed.

## Dependency audit (2026-10-25)

Initial npm ci/audit reported 7 vulnerable packages (1 Critical, 3 High, 3 Moderate).
Non-breaking npm audit fix updated the lockfile for MCP SDK 1.32.2 and affected
transitive dependencies, reducing this to one High advisory in Zod 3:
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
The reported fix requires Zod 4.6.6+ and a major migration; it was not forced into this
compatibility-focused phase. HTTP body limits reduce input size but do not prove the
memory-exhaustion risk is eliminated, especially for stdio input. Resolve and retest
schema compatibility before untrusted/public use. Audit fix exits 1 because this
advisory remains. The dependency audit is registry-reported and is not a reachability proof.
