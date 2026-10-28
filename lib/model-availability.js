// Safe display/validation policy shared by the admin UI and server.
export function modelBlocked(model) {
  return model?.supportsTools === false || model?.availability?.status === "blocked";
}

export function modelAvailabilityLabel(model) {
  if (model.supportsTools === false) return "Unavailable: no tool support";
  if (model.availability?.status === "blocked") return `Unavailable: ${model.availability.reason}`;
  if (model.availability?.status === "temporary") return `Retry later: ${model.availability.reason}`;
  if (model.availability?.status === "available") return "Access test passed";
  return "Listed by provider; credits and quota apply when chatting";
}

export function catalogAvailability(model, { allowed = true, now = Date.now() } = {}) {
  if (!allowed) return { status: "blocked", reason: "Excluded by this account's provider/privacy/guardrail settings." };
  const expires = Date.parse(model.shutdown_date || model.expiration_date || "");
  if (Number.isFinite(expires) && expires <= now) return { status: "blocked", reason: "Provider reports this model is retired." };
  return { status: "listed", reason: "Listed by the provider. Billing and request access have not been tested." };
}
