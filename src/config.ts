import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from "./client.js";

export interface ServerConfig {
  accessToken: string | undefined;
  port: number;
  host: string;
  dataDir: string;
  timezone: string;
  appId: string | undefined;
  appSecret: string | undefined;
  redirectUri: string | undefined;
  baseUrl: string;
  maxRetries: number;
  /** Key that seals the tokens the MCP authorization server issues. */
  authSecret: string | undefined;
  /** Absolute origin of this deployment, used to build OAuth URLs. */
  publicBaseUrl: string | undefined;
}

/**
 * Validate configuration without reflecting values in errors. Local mock use
 * needs no credentials; production requires a stable key and explicit origin.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const integer = (key: string, fallback: number, min: number, max: number): number => {
    const raw = nonEmpty(env[key]);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const timezone = nonEmpty(env.TZ) ?? "Asia/Ho_Chi_Minh";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
  catch { throw new Error("Invalid TZ"); }
  for (const key of ["PUBLIC_BASE_URL", "PINTEREST_REDIRECT_URI", "PINTEREST_API_BASE_URL"]) {
    const raw = nonEmpty(env[key]);
    if (!raw) continue;
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error(`Invalid ${key}`); }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.hash || url.search) throw new Error(`Invalid ${key}`);
    if (key === "PUBLIC_BASE_URL" && url.pathname !== "/") throw new Error("PUBLIC_BASE_URL must be an origin");
    if (key === "PINTEREST_API_BASE_URL" && !loopback && ![PRODUCTION_BASE_URL, SANDBOX_BASE_URL].includes(raw.replace(/\/+$/, ""))) throw new Error("PINTEREST_API_BASE_URL must be Pinterest or loopback mock");
  }
  if (nonEmpty(env.MCP_AUTH_SECRET) && env.MCP_AUTH_SECRET!.trim().length < 32) throw new Error("MCP_AUTH_SECRET must contain at least 32 characters");
  if (env.NODE_ENV === "production" && (!nonEmpty(env.MCP_AUTH_SECRET) || !nonEmpty(env.PUBLIC_BASE_URL))) throw new Error("Production requires MCP_AUTH_SECRET and PUBLIC_BASE_URL");
  if (env.PINTEREST_SANDBOX && !["0", "1", "true", "false", "yes", "no", "on", "off"].includes(env.PINTEREST_SANDBOX.trim().toLowerCase())) throw new Error("Invalid PINTEREST_SANDBOX");
  const useSandbox = isTruthy(env.PINTEREST_SANDBOX);
  const baseUrl =
    nonEmpty(env.PINTEREST_API_BASE_URL) ?? (useSandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL);

  return {
    port: integer("PORT", 3000, 1, 65535),
    host: nonEmpty(env.HOST) ?? "127.0.0.1",
    dataDir: nonEmpty(env.DATA_DIR) ?? "./data",
    timezone,
    accessToken: nonEmpty(env.PINTEREST_ACCESS_TOKEN),
    appId: nonEmpty(env.PINTEREST_APP_ID),
    appSecret: nonEmpty(env.PINTEREST_APP_SECRET),
    redirectUri: nonEmpty(env.PINTEREST_REDIRECT_URI),
    baseUrl,
    maxRetries: integer("PINTEREST_MAX_RETRIES", 3, 1, 10),
    authSecret: nonEmpty(env.MCP_AUTH_SECRET),
    publicBaseUrl: nonEmpty(env.PUBLIC_BASE_URL)?.replace(/\/+$/, ""),
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
