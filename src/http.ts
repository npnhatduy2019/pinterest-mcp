#!/usr/bin/env node
/**
 * Streamable-HTTP entry point, for running this server as a hosted remote MCP
 * endpoint rather than a local subprocess.
 *
 * Stateless by design: every POST builds its own server, transport and Pinterest
 * client, then tears them down. That costs a little per call and buys the property
 * that matters for a shared deployment â€” one caller's token can never be reused to
 * serve another caller's request.
 *
 * Three ways to authenticate, in order of preference:
 *   1. An OAuth token minted by this server (see src/auth), which seals the
 *      caller's own Pinterest credential inside it. This is what lets many people
 *      connect their own accounts to one deployment.
 *   2. A raw Pinterest token passed directly, for scripts and single-user setups.
 * Server-side tokens are never used for unauthenticated HTTP requests.
 */
import { log } from "./logging.js";
import { checkDataDirectory } from "./storage.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAuthRouter } from "./auth/router.js";
import { TokenCipher, resolveAuthSecret } from "./auth/tokens.js";
import { loadConfig } from "./config.js";
import { createOAuthRouter } from "./oauth-web.js";
import { SERVER_NAME, SERVER_VERSION, buildServer } from "./server.js";

const config = loadConfig();
const port = config.port;
await checkDataDirectory(config.dataDir);

const { secret, ephemeral } = resolveAuthSecret(config.authSecret);
const cipher = new TokenCipher(secret);

/** Absolute origin of this deployment; OAuth metadata must advertise it exactly. */
function issuer(req: Request): string {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  // Never derive the authorization issuer from untrusted forwarding headers.
  return `http://127.0.0.1:${port}`;
}

interface ResolvedAuth {
  token?: string;
  /** True when the caller presented a bearer token this server could not open. */
  rejected?: boolean;
}

/**
 * An OAuth token issued here wins; anything else opaque is taken at face value as
 * a Pinterest token so direct API users keep working.
 */
function resolveAuth(req: Request): ResolvedAuth {
  const explicit = req.header("x-pinterest-access-token")?.trim();
  if (explicit) return { token: explicit };

  const bearer = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    const opened = cipher.open<{ access_token: string }>("access", bearer);
    if (opened?.access_token) return { token: opened.access_token };
    // Tokens this server minted are long and base64url; a short opaque string is
    // far more likely to be someone passing their Pinterest token directly.
    return { token: bearer };
  }

  return { rejected: true };
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", false);
app.use((_req, res, next) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
  next();
});
app.use(express.json({ limit: "12mb" })); // base64 pin images travel in the body
app.use(express.urlencoded({ extended: false })); // OAuth token endpoint posts a form

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    server: SERVER_NAME,
    version: SERVER_VERSION,
    // Never echo the token itself, only whether a fallback exists.
    default_token_configured: Boolean(config.accessToken),
    web_login_available: Boolean(config.appId && config.appSecret),
    oauth_enabled: Boolean(config.appId && config.appSecret),
    // A restart invalidates issued tokens unless MCP_AUTH_SECRET is set.
    auth_secret_ephemeral: ephemeral,
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await checkDataDirectory(config.dataDir);
    res.json({ status: "ready", pinterest_connectivity: "unchecked", scheduler: "not_implemented" });
  } catch {
    log("error", "storage_not_ready");
    res.status(503).json({ status: "not_ready" });
  }
});

// OAuth 2.1 authorization server: metadata, registration, authorize, token.
app.use(createAuthRouter({ config, cipher, issuer }));

// Human-facing browser flow for minting a raw token: GET /auth
app.use(createOAuthRouter(config));

app.get("/", (_req: Request, res: Response) => {
  res.redirect(config.appId && config.appSecret ? "/auth" : "/health");
});

app.post("/mcp", async (req: Request, res: Response) => {
  const { token, rejected } = resolveAuth(req);

  if (!token || rejected) {
    // RFC 9728: point the client at the metadata that starts the OAuth dance.
    res.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${issuer(req)}/.well-known/oauth-protected-resource"`,
    );
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Authentication required. Connect this server through OAuth, or send a Pinterest token as 'Authorization: Bearer <token>' or 'X-Pinterest-Access-Token'.",
      },
      id: null,
    });
    return;
  }

  const server = buildServer(config, token);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    log("error", "mcp_request_failed");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode has no stream to resume and no session to delete.
const methodNotAllowed = (_req: Request, res: Response): void => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "This endpoint is stateless; use POST /mcp." },
    id: null,
  });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

// Express parser errors can include request fragments; never echo or log them.
app.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  log("warn", "http_request_rejected");
  if (!res.headersSent) res.status(400).json({ error: "Request rejected" });
});

app.listen(port, config.host, () => {
  // Compatibility marker for existing process-based integration tests.
  process.stdout.write(JSON.stringify({ event: "listening on", port, host: config.host }) + "\n");
  log("info", "http_started", { port, host: config.host, ephemeral });
});
