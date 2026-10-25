import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
/** Probe the mounted directory as the actual runtime user. No database is created yet. */
export async function checkDataDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `.readiness-${randomUUID()}`);
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile("ready"); } finally { await file.close(); await unlink(path); }
}
