import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../dist/config.js";
import { redact } from "../dist/logging.js";
import { ok, run } from "../dist/tools/shared.js";
import { checkDataDirectory } from "../dist/storage.js";
import { PinterestClient } from "../dist/client.js";
const fixture = JSON.parse(await readFile(new URL("./fixtures/pinterest.json", import.meta.url)));

test("config defaults need no Pinterest credentials", () => {
  const config = loadConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(config.accessToken, undefined);
});
test("config rejects invalid settings without reflecting secrets", () => {
  for (const env of [{ PORT: "nan" }, { PORT: "0" }, { PINTEREST_MAX_RETRIES: "2.5" },
    { PINTEREST_MAX_RETRIES: "0" }, { TZ: "invalid/zone" }, { MCP_AUTH_SECRET: "short" },
    { PUBLIC_BASE_URL: "https://owner:secret@example.com" }, { PUBLIC_BASE_URL: "https://example.com/path" },
    { PINTEREST_REDIRECT_URI: "javascript:alert(1)" }, { PINTEREST_SANDBOX: "maybe" },
    { PINTEREST_API_BASE_URL: "https://attacker.example/v5" }, { NODE_ENV: "production" }]) {
    assert.throws(() => loadConfig(env));
  }
  assert.equal(loadConfig({ PINTEREST_API_BASE_URL: "http://127.0.0.1:9999/v5" }).baseUrl, "http://127.0.0.1:9999/v5");
});
test("nested credentials and tool responses are redacted", async () => {
  const payload = { nested: [{ access_token: "hidden", refresh_token: "hidden2", authorization: "hidden3" }], title: "A book" };
  assert.equal(redact({ authorization_url: "https://www.pinterest.com/oauth/" }).authorization_url, "https://www.pinterest.com/oauth/");
  assert.equal(redact(payload).nested[0].access_token, "[REDACTED]");
  assert.ok(!JSON.stringify(ok(payload)).includes("hidden"));
  const failure = await run(async () => { throw new Error("secret provider payload"); });
  assert.ok(!JSON.stringify(failure).includes("secret provider payload"));
});
test("storage probe creates writable directory and leaves no probe files", async () => {
  const path = await mkdtemp(join(tmpdir(), "publisher-test-"));
  try { await checkDataDirectory(join(path, "data")); }
  finally { await rm(path, { recursive: true }); }
});
test("mock fixture supports successful requests and pending access errors", async () => {
  const client = new PinterestClient({ accessToken: "fake", fetchImpl: async () => Response.json(fixture.account) });
  assert.deepEqual(await client.request("/user_account"), fixture.account);
  const blocked = new PinterestClient({ accessToken: "fake", fetchImpl: async () => Response.json(fixture.forbidden, { status: 403 }) });
  await assert.rejects(() => blocked.request("/pins"), /403/);
});
test("ambiguous writes are never retried", async () => {
  for (const network of [false, true]) {
    let calls = 0;
    const client = new PinterestClient({ accessToken: "fake", fetchImpl: async () => {
      calls++;
      if (network) throw new Error("connection lost");
      return Response.json({}, { status: 503 });
    }});
    await assert.rejects(() => client.request("/pins", { method: "POST", body: fixture.pin }));
    assert.equal(calls, 1);
  }
});
test("API redirects cannot forward bearer credentials", async () => {
  const client = new PinterestClient({ accessToken: "fake", fetchImpl: async (_url, init) => {
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    return Response.json({});
  }});
  await client.request("/boards");
});
