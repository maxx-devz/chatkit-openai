import { workspaceError } from "./workspace-selection.js";

const protectedFields = ["agencyId", "agency_id", "clientId", "client_id", "ownerId", "owner_id",
  "userId", "user_id", "submitted_by", "created_by", "permissions", "isAdmin", "priceOverride",
  "price_override", "billingReference", "billing_reference"];

export function assertClientMutation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      protectedFields.some(field => Object.hasOwn(input, field))) {
    throw workspaceError("invalid_client_input", "Use the fields supported by this client action.", 400);
  }
}
