import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { attachDevOutput, formatDevLine, supportsLogColor } from "./dev-log-format.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root, true);
// The launcher owns colors. Child pipes stay plain and Python remains unbuffered.
const env = { ...process.env, NO_COLOR: "1", PYTHONUNBUFFERED: "1" };
delete env.FORCE_COLOR;
const color = supportsLogColor();
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

function run(command, args, cwd = root, source = "WEB") {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  attachDevOutput(child, { source, color });
  children.push(child);
  child.on("error", () => {
    console.error(formatDevLine("ERROR: A development service could not start. See docs/CHATKIT_SETUP.md.", { source, color }));
    stop(1);
  });
  child.on("exit", (code) => { if (!stopping) stop(code || 0); });
}

console.log(formatDevLine("Services: WEB Next.js | CHAT Python | DRIVE source sync | INDEX Hubstaff. Method and status colors are independent.", { color }));

{
  const backendUrl = env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000";
  env.CHATKIT_BACKEND_URL = backendUrl;
  const localBackend = new URL(backendUrl);
  if (["127.0.0.1", "localhost"].includes(localBackend.hostname)) {
    const python = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    if (!existsSync(python)) {
      console.error(formatDevLine("ERROR: ChatKit needs its Python environment. Follow steps 1–2 in docs/CHATKIT_SETUP.md.", { source: "CHAT", color }));
      process.exit(1);
    }
    if (!env.CHATKIT_BACKEND_SECRET?.trim()) {
      env.CHATKIT_BACKEND_SECRET = randomBytes(32).toString("hex");
    }
    // One Python process avoids leaving a reload supervisor running after Ctrl+C.
    run(python, ["dev.py", localBackend.port || "8000"], path.join(root, "chatkit_backend"), "CHAT");
  }
}

run(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", "3000"]);
// Optional, isolated Drive worker: failure must not stop either portal or the Python service.
if (env.LOCAL_SOURCE_SYNC === "true" && env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
  const worker = spawn(process.execPath, ["--conditions=react-server", path.join(root, "scripts/sync-prepared-sources.mjs"), "--watch"],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  attachDevOutput(worker, { source: "DRIVE", color });
  children.push(worker);
  worker.on("error", () => console.warn(formatDevLine("WARN: Optional Drive source worker could not start. Chat services remain running.", { source: "DRIVE", color })));
}
process.on("SIGINT", () => stop());
// Optional index worker is isolated from both portals; a sync error never stops chat.
if (env.LOCAL_HUBSTAFF_INDEX_SYNC === "true") {
  const worker = spawn(process.execPath, ["--conditions=react-server", path.join(root,"scripts/sync-hubstaff-search.mjs"),"--watch"],
    {cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  attachDevOutput(worker, { source: "INDEX", color });
  children.push(worker);
  worker.on("error",() => console.warn(formatDevLine("WARN: Optional Hubstaff index worker could not start. Chat services remain running.", { source: "INDEX", color })));
}
process.on("SIGTERM", () => stop());
// Own terminal input instead of allowing either child to consume Ctrl+C.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => { if (chunk.includes(3)) stop(); });
}
