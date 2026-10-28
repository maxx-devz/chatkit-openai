import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { attachDevOutput, formatDevLine, summarizeSync, supportsLogColor, syncFailureMessage } from "../scripts/dev-log-format.mjs";

const now = new Date(2026, 9, 28, 14, 32, 7);
const plain = (line, source = "WEB") => formatDevLine(line, { source, now });

test("Next.js access logs become aligned route/status/duration lines", () => {
  assert.equal(plain(" POST /api/chatkit 200 in 6.3s (next.js: 18ms, application-code: 6.3s)"),
    "14:32:07  WEB     POST      200 OK         6.30 s  /api/chatkit");
  assert.match(plain(" GET /api/presence 200 in 1308ms (compile: 9ms, render: 1299ms)"), /200 OK\s+1\.31 s\s+\/api\/presence$/);
  assert.match(plain(" GET /api/debugger/session 200 in 507ms"), /200 OK\s+507 ms/);
  assert.match(plain(" GET / 200 in 0ms"), /200 OK\s+0 ms/);
});

test("Python access logs do not invent a request duration", () => {
  assert.equal(plain('INFO:     127.0.0.1:62024 - "POST /chatkit HTTP/1.1" 200 OK', "CHAT"),
    "14:32:07  CHAT    POST      200 OK             --  /chatkit");
  assert.match(plain('127.0.0.1:5555 - "GET /health HTTP/1.1" 503 Service Unavailable', "CHAT"), /GET\s+503 ERROR\s+--\s+\/health$/);
});

test("Every supported method has a distinct stable color", () => {
  const colors = new Set();
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT", "TRACE"]) {
    const text = formatDevLine(`${method} /example 200 in 1ms`, { source: "WEB", color: true, now });
    const code = text.match(new RegExp(`\\x1b\\[1;([0-9;]+)m ${method}(?:\\s|\\x1b)`))?.[1];
    assert.ok(code, text);
    colors.add(code);
    assert.equal(stripVTControlCharacters(text), plain(`${method} /example 200 in 1ms`));
  }
  assert.equal(colors.size, 9);
});

test("HTTP status colors are independent of method colors", () => {
  for (const [status, palette] of [[101, "97;44"], [200, "30;102"], [204, "30;102"], [302, "30;106"], [401, "30;103"], [429, "30;103"], [500, "97;41"], [503, "97;41"]]) {
    const text = formatDevLine(`GET /example ${status} in 1ms`, { color: true, now });
    assert.ok(text.includes(`\x1b[1;${palette}m ${status} `));
  }
});

test("Badges set contrasting foreground/background pairs and reset before neighboring columns", () => {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT", "TRACE"]) {
    const text = formatDevLine(`${method} /api/example 200 in 1ms`, { source: "WEB", color: true, now });
    const badges = [...text.matchAll(/\x1b\[1;(30|97);(\d+)m ([^\x1b]*) \x1b\[0m/g)];
    assert.equal(badges.length, 3, "Service, method and status each have a reset, foreground and background");
    for (const [, foreground, background] of badges) {
      // Black on bright cyan/magenta/yellow/green/white, or white on
      // dark blue/red/magenta/black/gray; never dark blue text on black.
      assert.ok(foreground === "30" ? [102, 103, 105, 106, 107].includes(Number(background))
        : [40, 41, 44, 45, 100].includes(Number(background)));
    }
    assert.ok(text.endsWith("\x1b[0m  /api/example"));
  }
  const post = formatDevLine("POST /api/auth/sign-out 200 in 507ms", { source: "WEB", color: true, now });
  assert.ok(post.includes("\x1b[1;30;105m POST"));
  assert.ok(post.includes("\x1b[1;30;102m 200 OK"));
});

test("Status text explains results even with colors disabled", () => {
  for (const [code, label] of [[200, "OK"], [302, "REDIR"], [401, "AUTH"], [403, "DENIED"],
    [404, "MISSING"], [408, "TIMEOUT"], [429, "LIMIT"], [500, "ERROR"]]) {
    assert.ok(plain(`POST /api/example ${code} in 1ms`).includes(`${code} ${label}`));
  }
});

test("Recognized request labels omit sensitive queries, fragments and URL credentials", () => {
  for (const path of ["/api/callback?code=private&token=secret#fragment", "https://user:pass@example.test/api/callback?token=secret"]) {
    const text = plain(`GET ${path} 200 in 5ms`);
    assert.match(text, /\/api\/callback$/);
    assert.doesNotMatch(text, /private|secret|fragment|user:pass|example\.test/);
  }
});

test("Plain output and color preference overrides work for redirected logs", () => {
  assert.equal(supportsLogColor({}, { isTTY: true }), true);
  assert.equal(supportsLogColor({}, {}), false);
  assert.equal(supportsLogColor({ NO_COLOR: "" }, { isTTY: true }), false);
  assert.equal(supportsLogColor({ FORCE_COLOR: "0" }, { isTTY: true }), false);
  assert.equal(supportsLogColor({ FORCE_COLOR: "1" }, {}), true);
  assert.equal(supportsLogColor({ NO_COLOR: "1", FORCE_COLOR: "1" }, {}), false);
  assert.equal(supportsLogColor({ TERM: "dumb" }, { isTTY: true }), false);
  assert.doesNotMatch(plain("GET / 200 in 1ms"), /\x1b/);
});

test("Warnings, errors, tracebacks and unfamiliar framework output remain visible", () => {
  for (const line of ["Traceback (most recent call last):", '  File "assistant.py", line 10', "ValueError: example",
    "WARNING: Example warning", "ERROR: Example failure", "✓ Ready in 500ms", "  Future framework request format"]) {
    assert.ok(plain(line, "CHAT").includes(line.replace(/^(WARNING|ERROR): /, "")));
  }
  assert.match(formatDevLine("ERROR: Example failure", { color: true, now }), /\x1b\[1;97;41m ERROR/);
  assert.equal(plain("   "), null);
  assert.doesNotMatch(plain("\x1b[31mERROR:\x1b[0m example\x1b[2J"), /\x1b/);
});

test("Source sync summary shows counts without raw internal identifiers or folder titles", () => {
  const text = summarizeSync({ results: [{ ownerId: "private-owner", rootName: "Private company knowledge",
    corpusRevision: "private-hash", ready: true, indexedDocuments: 13, fetchedDocuments: 0,
    reusedDocuments: 13, removedDocuments: 0, unsupportedFiles: 2 }], intervalSeconds: 60 });
  assert.equal(text, "INFO: Source sync | 1 ready | 13 indexed | 0 fetched | 13 reused | 2 unsupported | interval 60s");
  assert.doesNotMatch(text, /private|Private|ownerId|corpusRevision/);
});

test("Worker skips, failures and incomplete indexes cannot be reported as a successful refresh", () => {
  assert.match(summarizeSync({ results: [{ skipped: true }] }), /0 ready \| 1 skipped \| no refresh completed/);
  assert.match(summarizeSync({ results: [{ ready: false, code: "private-error" }] }), /^WARN:.*1 failed.*no refresh/);
  assert.doesNotMatch(summarizeSync({ results: [{ ready: false, code: "private-error" }] }), /private-error/);
  assert.match(summarizeSync({ unknown: "shape" }), /^WARN:.*1 unknown/);
  const text = summarizeSync({ results: [{ clientId: "private-client", syncedTasks: 25, syncedComments: 80, metadataComplete: false }] }, "index");
  assert.match(text, /^WARN:.*25 tasks synced.*80 comments synced.*1 histories incomplete/);
  assert.doesNotMatch(text, /private-client/);
  assert.match(summarizeSync({ results: [{ ready: false, code: "reconnect_required" }] }), /codes: reconnect_required/);
  assert.equal(syncFailureMessage({ code: "42P01", message: "PRIVATE DATABASE DETAIL" }), "ERROR: Source sync unavailable | 42P01");
  assert.equal(syncFailureMessage({ code: "untrusted-private-value", message: "secret" }, "index"), "ERROR: Hubstaff index unavailable | sync_failed");
});

test("Separate child pipes buffer split UTF-8/chunks and flush unterminated errors", async () => {
  const child = { stdout: new PassThrough(), stderr: new PassThrough() };
  const logs = [], errors = [];
  const readers = attachDevOutput(child, { source: "WEB", color: false, clock: () => now,
    output: { write: line => logs.push(line) }, errorOutput: { write: line => errors.push(line) } });
  const closed = Promise.all(readers.map(reader => once(reader, "close")));
  child.stdout.write("GET /api/pres");
  child.stderr.write("ERROR: Failure\n  traceback continuation");
  child.stdout.write("ence 200 in 12ms\r");
  child.stdout.write("\n");
  const unicode = Buffer.from("✓ Ready\n");
  child.stdout.write(unicode.subarray(0, 1));
  child.stdout.end(unicode.subarray(1));
  child.stderr.end();
  await closed;
  assert.equal(logs.length, 2);
  assert.match(logs[0], /GET\s+200 OK\s+12 ms\s+\/api\/presence\n$/);
  assert.ok(logs[1].includes("✓ Ready"));
  assert.equal(errors.length, 2);
  assert.ok(errors[1].includes("  traceback continuation"));
});

test("Real child process output is formatted without starting a portal, worker or API request", async () => {
  const output = [];
  const child = spawn(process.execPath, ["-e",
    'process.stdout.write("GET /api/example 200 in 12ms\\n"); process.stderr.write("ERROR: fixture only\\n");'],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  attachDevOutput(child, { source: "WEB", color: false, clock: () => now,
    output: { write: line => output.push(line) }, errorOutput: { write: line => output.push(line) } });
  const [code] = await once(child, "close");
  assert.equal(code, 0);
  assert.equal(output.length, 2);
  assert.ok(output.some(line => /GET\s+200 OK\s+12 ms\s+\/api\/example/.test(line)));
  assert.ok(output.some(line => /ERROR\s+fixture only/.test(line)));
});

test("The actual dev launcher pipes and flushes service output using isolated fake services", { timeout: 10000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), "aoc-dev-logs-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  for (const folder of ["scripts", "node_modules/@next/env", "node_modules/next/dist/bin"]) {
    await mkdir(path.join(root, folder), { recursive: true });
  }
  for (const name of ["dev.mjs", "dev-log-format.mjs"]) {
    await copyFile(new URL(`../scripts/${name}`, import.meta.url), path.join(root, "scripts", name));
  }
  // No real Next server, Python, environment loader, worker, database or API.
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, "node_modules/@next/env/package.json"), '{"type":"module","main":"index.js"}');
  await writeFile(path.join(root, "node_modules/@next/env/index.js"), 'export default {loadEnvConfig(){}};');
  await writeFile(path.join(root, "node_modules/next/dist/bin/next"),
    'process.stdout.write("POST /api/chatkit 200 in 6.3s (next.js: 18ms)\\n"); process.stderr.write("ERROR: fixture only\\n");');
  const child = spawn(process.execPath, [path.join(root, "scripts/dev.mjs")], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
      CHATKIT_BACKEND_URL: "https://backend.invalid", LOCAL_SOURCE_SYNC: "false",
      LOCAL_HUBSTAFF_INDEX_SYNC: "false", NO_COLOR: "1" },
  });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const [code] = await once(child, "close");
  assert.equal(code, 0, stderr);
  assert.match(stdout, /WEB\s+POST\s+200 OK\s+6\.30 s\s+\/api\/chatkit/);
  assert.match(stderr, /WEB\s+ERROR\s+fixture only/);
  assert.doesNotMatch(stdout + stderr, /\x1b|next\.js:|NO_COLOR.*ignored/);
});
