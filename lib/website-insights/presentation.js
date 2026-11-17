export function googleConnectionView(status, attempt) {
  const hasAuthorization = status?.hasAuthorization === true;
  const incomplete = status?.state === "sign_in_incomplete";
  const failedAttempt = ["failed", "cancelled"].includes(attempt);
  const ready = !failedAttempt && status?.state === "ready" && status.connected === true
    && status.accessVerified === true && Boolean(status.property);
  const labels = { not_configured: "Google setup required", not_connected: "Not connected",
    sign_in_incomplete: "Google sign-in not completed", property_required: "Choose a Search Console property",
    no_matching_property: "No matching Search Console property", api_disabled: "Search Console API not enabled",
    reconnect_required: "Google reconnection required", google_reconnect: "Google authorization needs attention",
    google_access: "Search Console access not verified", google_unavailable: "Search Console access not verified" };
  return { ready, hasAuthorization, canCheck: hasAuthorization && !incomplete && status?.state !== "checking",
    canSelectProperty: !failedAttempt && !incomplete && status?.accessVerified === true && status.properties?.length > 0,
    label: failedAttempt ? "Latest Google sign-in did not complete" : ready ? "Connected to " + status.property
      : status?.state === "checking" || !status ? "Checking Google connection..." : labels[status.state] || "Google authorization saved; access not verified",
    message: failedAttempt ? "This attempt did not connect a new Google account. Any earlier authorization remains saved; check it explicitly or retry sign-in."
      : status?.message || "A saved authorization alone does not confirm access to this website's Search Console data." };
}

export function compareReports(previous, current) {
  if (!previous || !current) return null;
  const oldIds = new Set(previous.findings.map(item => item.id)), newIds = new Set(current.findings.map(item => item.id));
  const commonPages = new Set(current.pages.filter(page => page.status === 200
    && previous.pages.some(old => old.url === page.url && old.status === 200)).map(page => page.url));
  return { newFindings: current.findings.filter(item => !oldIds.has(item.id)),
    noLongerDetected: previous.findings.filter(item => !newIds.has(item.id) && commonPages.has(item.page)
      && ["seo", "accessibility", "geo"].includes(item.category)), commonPages: commonPages.size,
    note: "No longer detected means absent on pages checked in both reports, not proof of a fix. Different crawl samples, Google date ranges and lab conditions limit comparisons." };
}
export function safePageLink(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function reportCsv(report) {
  const cell = value => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [["Priority", "Category", "Type", "Page", "Issue", "Discovered", "Why it matters", "Recommendation"],
    ...report.findings.map(item => [item.severity, item.category, item.kind, item.page, item.title, item.discovered, item.why, item.recommendation])]
    .map(row => row.map(cell).join(",")).join("\r\n");
}
