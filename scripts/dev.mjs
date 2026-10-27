import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root, true);
const env = { ...process.env };
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      // Both the Python venv launcher and Next CLI can spawn child processes.
      // Terminate only the trees owned by this launcher so their ports are freed.
      const shutdown = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true, stdio: "ignore",
      });
      shutdown.on("error", () => child.kill("SIGTERM"));
    } else {
      child.kill("SIGTERM");
    }
  }
  process.exitCode = code;
}

function run(command, args, cwd = root) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
  children.push(child);
  child.on("error", () => {
    console.error("A development service could not start. See docs/CHATKIT_SETUP.md.");
    stop(1);
  });
  child.on("exit", (code) => { if (!stopping) stop(code || 0); });
}

{
  const backendUrl = env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000";
  env.CHATKIT_BACKEND_URL = backendUrl;
  const localBackend = new URL(backendUrl);
  if (["127.0.0.1", "localhost"].includes(localBackend.hostname)) {
    const python = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    if (!existsSync(python)) {
      console.error("ChatKit needs its Python environment. Follow steps 1–2 in docs/CHATKIT_SETUP.md.");
      process.exit(1);
    }
    if (!env.CHATKIT_BACKEND_SECRET?.trim()) {
      env.CHATKIT_BACKEND_SECRET = randomBytes(32).toString("hex");
    }
    // One Python process avoids leaving a reload supervisor running after Ctrl+C.
    run(python, ["dev.py", localBackend.port || "8000"], path.join(root, "chatkit_backend"));
  }
}

run(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", "3000"]);
// Optional, isolated Drive worker: failure must not stop either portal or the Python service.
if (env.LOCAL_SOURCE_SYNC === "true" && env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
  const worker = spawn(process.execPath, ["--conditions=react-server", path.join(root, "scripts/sync-prepared-sources.mjs"), "--watch"],
    { cwd: root, env, stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
  children.push(worker);
  worker.on("error", () => console.warn("Optional Drive source worker could not start. Chat services remain running."));
}
process.on("SIGINT", () => stop());
// Optional index worker is isolated from both portals; a sync error never stops chat.
if (env.LOCAL_HUBSTAFF_INDEX_SYNC === "true") {
  const worker = spawn(process.execPath, ["--conditions=react-server", path.join(root,"scripts/sync-hubstaff-search.mjs"),"--watch"],
    {cwd:root,env,stdio:["ignore","inherit","inherit"],windowsHide:true});
  children.push(worker);
  worker.on("error",() => console.warn("Optional Hubstaff index worker could not start. Chat services remain running."));
}
process.on("SIGTERM", () => stop());
// Own terminal input instead of allowing either child to consume Ctrl+C.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => { if (chunk.includes(3)) stop(); });
}
