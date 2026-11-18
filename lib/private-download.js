// All callers authenticate and resolve ownership before reading private bytes.
export function privateDownloadHeaders(file) {
  const filename = String(file.filename || "download")
    .split(/[\\/]/).at(-1).replace(/[^a-zA-Z0-9 ._-]/g, "_")
    .replace(/^\.+/, "").slice(0, 180) || "download";
  return {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "Content-Type": file.mime_type || "application/octet-stream",
    "Content-Length": String(file.content.length),
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
  };
}
