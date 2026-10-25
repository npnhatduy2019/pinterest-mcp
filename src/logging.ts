/** Redact before serialization; never log request bodies or raw Error objects. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      /token|secret|password|cookie|^authorization$|^code_verifier$/i.test(key) ? "[REDACTED]" : redact(item)]));
  }
  if (typeof value !== "string") return value;
  let result = value.replace(/(Bearer|Basic)\s+[^\s"<>]+/gi, "$1 [REDACTED]");
  for (const [key, secret] of Object.entries(process.env)) {
    if (/TOKEN|SECRET|PASSWORD/.test(key) && secret) result = result.split(secret).join("[REDACTED]");
  }
  return result.replace(/((?:access_token|refresh_token|app_secret|password)["']?\s*[:=]\s*["']?)[^\s,"'&<>]+/gi, "$1[REDACTED]");
}
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): void {
  process.stderr.write(JSON.stringify({ time: new Date().toISOString(), level, event, ...redact(fields) as object }) + "\n");
}
