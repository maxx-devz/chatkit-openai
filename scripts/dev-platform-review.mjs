// Scrub inherited remote settings before Next reads any local environment files.
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== "127.0.0.1" || url.search || !["postgres:", "postgresql:"].includes(url.protocol) || !/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(url.pathname) || process.env.BETTER_AUTH_URL !== "http://127.0.0.1:3000" || (process.env.BETTER_AUTH_SECRET || "").length < 32) throw Error("Configure the disposable local runtime and loopback authentication privately first.");
  const root = new URL("../", import.meta.url), env = {};
  for (const [key, value] of Object.entries(process.env)) if (/^(path|pathext|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles|programfiles\(x86\)|homedrive|homepath|home|lang|lc_all)$/i.test(key)) env[key] = value;
  for (const file of await readdir(root)) if (file.startsWith(".env")) {
    const content = await readFile(new URL(file, root), "utf8").catch(() => "");
    for (const match of content.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) if (!(match[1] in env)) env[match[1]] = "";
  }
  Object.assign(env, { DATABASE_URL: url.href, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    CHATKIT_BACKEND_URL: "http://127.0.0.1:1", LOCAL_SOURCE_SYNC: "false", __NEXT_PROCESSED_ENV: "true", NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development" });
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", "3000"], { cwd: fileURLToPath(root), env, stdio: "inherit", windowsHide: true });
  child.on("error", () => { process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
  console.log("Synthetic local review: http://127.0.0.1:3000/platform. AI/providers and background watchers are not started.");
}
main().catch(() => { console.error("Local review requires approved disposable configuration; remote URLs are refused."); process.exitCode = 1; });
