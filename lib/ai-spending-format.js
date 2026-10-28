export function usd(value) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) return "Unknown";
  const amount = Number(value);
  if (amount > 0 && amount < 0.000001) return "< $0.000001";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2,
    maximumFractionDigits: 6 }).format(amount);
}

export function costStatus(client) {
  if (client.unpricedEvents || client.missingTurns) return "Incomplete — known subtotal only";
  if (!client.events) return "No recorded calls";
  if (client.partialHistory) return "Partial history — tracking began after month start";
  return client.estimatedEvents ? "Contains estimates — not an invoice" : "Provider-reported charges";
}

export function unpricedReason(code) {
  return ({ usage_not_reported: "Provider usage was missing or partial",
    specialized_charge_requires_reconciliation: "Image/tool/indexing charge needs reconciliation",
    provider_did_not_report_cost: "Provider did not return a charge",
    model_price_not_verified: "This model's price has not been verified",
    pricing_review_required: "Published pricing needs review" })[code] || "Cost could not be verified";
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function spendingCsv(snapshot) {
  const rows = [["UTC month", "Client", "Workspace", "Known subtotal USD", "Provider-reported USD", "Estimated USD",
    "Recorded turns", "Unpriced events", "Turns without cost records", "Status", "Tracking started", "Last recorded"]];
  for (const c of snapshot.clients) rows.push([snapshot.period, c.name, c.slug, c.knownUsd, c.reportedUsd, c.estimatedUsd,
    c.turns, c.unpricedEvents, c.missingTurns, costStatus(c), snapshot.trackingStartedAt, c.lastRecordedAt]);
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
