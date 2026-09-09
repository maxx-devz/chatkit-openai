import assert from "node:assert/strict";
import test from "node:test";
import { MAX_UPLOAD_BYTES, readUpload, uploadErrorMessage } from "../lib/chatkit-uploads.js";

function request(name, content, type = "application/octet-stream") {
  const body = new FormData();
  body.set("file", new File([content], name, { type }));
  return new Request("https://portal.example/api/chatkit/upload", { method: "POST", body });
}
test("multipart preserves file bytes and Unicode without trusting the browser MIME", async () => {
  const content = 'name,total\n客户,42\n';
  const result = await readUpload(request("report.csv", content));
  assert.equal(result.filename, "report.csv");
  assert.equal(Buffer.from(result.content, "base64").toString(), content);
});
test("uploads reject unsupported, empty, multiple and oversized files", async () => {
  for (const [name, body, code] of [["run.exe", "test", "upload_type_not_allowed"],
    ["data.txt", "", "upload_invalid_file"], ["data.txt", new Uint8Array(MAX_UPLOAD_BYTES + 1), "upload_too_large"]]) {
    await assert.rejects(readUpload(request(name, body)), { code });
  }
  const body = new FormData();
  body.append("file", new File(["one"], "one.txt"));
  body.append("file", new File(["two"], "two.txt"));
  await assert.rejects(readUpload(new Request("https://portal.example", { method: "POST", body })), { code: "upload_invalid_file" });
});
test("streamed bodies cannot bypass the size limit by omitting Content-Length", async () => {
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(MAX_UPLOAD_BYTES + 32769)); controller.close();
  } });
  const req = new Request("https://portal.example", { method: "POST", body, duplex: "half",
    headers: { "Content-Type": "multipart/form-data; boundary=test" } });
  await assert.rejects(readUpload(req), { code: "upload_too_large" });
  assert.equal(uploadErrorMessage("raw-provider-message-or-secret"), null);
});
