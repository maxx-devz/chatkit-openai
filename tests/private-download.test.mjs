import test from "node:test";
import assert from "node:assert/strict";
import { privateDownloadHeaders } from "../lib/private-download.js";

test("private bytes use attachment delivery with sanitized names and no shared cache", () => {
  for (const name of ["../../private.html", "..\\private.html", 'file"\r\nX-Test: value.html', "", "..."]) {
    const headers=privateDownloadHeaders({filename:name,mime_type:"text/html",content:Buffer.from("<script>fixture</script>")});
    assert.equal(headers["Cache-Control"],"private, no-store");
    assert.equal(headers.Vary,"Cookie");
    assert.equal(headers["Content-Security-Policy"],"default-src 'none'; sandbox");
    assert.equal(headers["X-Content-Type-Options"],"nosniff");
    assert.doesNotMatch(headers["Content-Disposition"],/[\r\n\\/]/);
    assert.match(headers["Content-Disposition"],/^attachment; filename="[a-zA-Z0-9 _.-]+"$/);
  }
});
