import { validateSiteModel } from "./site-ai-repository.js";

export function selectedProviderModel(provider, draft) {
  if (draft.catalogProvider !== provider) throw new Error("Verify the model list for this provider before saving.");
  return validateSiteModel(draft.model, { verified: draft.verified, models: draft.models });
}

export function providerSetupMessage({ tablesReady, auditReady, encryptionReady }) {
  if (!tablesReady) return "Run npm run site-ai:migrate to enable these settings.";
  if (!auditReady) return "Run npm run admin-audit:migrate before saving provider settings.";
  if (!encryptionReady) return "Set the same stable PROVIDER_SETTINGS_SECRET (32+ characters) on both servers and restart them.";
  return "";
}

export function missingProviderSchemaMessage(error) {
  if (error?.code !== "42P01") return null;
  return /portal_audit_events/.test(error.message || "")
    ? "Run npm run admin-audit:migrate before saving provider settings."
    : "Run npm run site-ai:migrate before configuring providers.";
}
