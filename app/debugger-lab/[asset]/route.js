import { readFile } from "node:fs/promises";
import path from "node:path";
import { debuggerAccess } from "@/lib/debugger/access";
import { debuggerLabEnabled } from "@/lib/debugger/security";
export const runtime = "nodejs";
export async function GET(request, { params }) {
  const { asset } = await params;
  if (!debuggerLabEnabled()) return new Response(null, { status: 404 });
  // Public, content-free fixture assets avoid hundreds of auth/DB calls in the
  // large-resource test. The lab UI and active probes still require a developer.
  const staticFixture = ["image.svg", "probe.css", "import.css", "font.ttf"].includes(asset);
  if (!staticFixture && !await debuggerAccess(request.headers)) return new Response(null, { status: 404 });
  const headers = { "Cache-Control": "private, no-store" };
  if (asset === "missing.png") return new Response("Intentional development probe: missing image", { status: 404, headers });
  if (asset === "probe.css") return new Response('@import url("/debugger-lab/import.css"); @font-face { font-family: DebuggerProbe; src: url("/debugger-lab/font.ttf") format("truetype"); font-display: swap; } .debugger-probe-font { font-family: DebuggerProbe, sans-serif; }', { headers: { ...headers, "Content-Type": "text/css" } });
  if (asset === "import.css") return new Response(".debugger-probe-font { border-left: 2px solid #35d8f3; padding: 12px; }", { headers: { ...headers, "Content-Type": "text/css" } });
  if (asset === "font.ttf") {
    try { const data = await readFile(path.join(process.cwd(), "tests/debugger/assets/Abel-Regular.ttf")); return new Response(data, { headers: { ...headers, "Content-Type": "font/ttf" } }); }
    catch { return new Response("The bundled font is unavailable.", { status: 404, headers }); }
  }
  if (asset === "image.svg") return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" rx="14" fill="#102b42"/><circle cx="160" cy="70" r="27" fill="none" stroke="#35d8f3" stroke-width="3"/><text x="160" y="125" fill="#bceaff" text-anchor="middle" font-family="sans-serif">Actual image request</text></svg>', { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  if (asset === "slow.json") { await new Promise((resolve) => setTimeout(resolve, 1800)); return Response.json({ probe: "delayed", delayMs: 1800 }, { headers }); }
  if (asset === "data.json") return Response.json({ probe: "parallel", ok: true }, { headers });
  if (asset === "redirect.json") return Response.redirect(new URL("/debugger-lab/data.json", process.env.BETTER_AUTH_URL), 307);
  if (asset === "stream.json") {
    let index = 0, timer;
    return new Response(new ReadableStream({ start(controller) { timer = setInterval(() => { controller.enqueue(new TextEncoder().encode(JSON.stringify({ probeChunk: ++index }) + "\n")); if (index >= 5) { clearInterval(timer); controller.close(); } }, 250); }, cancel() { clearInterval(timer); } }), { headers: { ...headers, "Content-Type": "application/x-ndjson" } });
  }
  return new Response(null, { status: 404, headers });
}
