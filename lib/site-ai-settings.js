import "server-only";
import { databaseSql } from "./database.js";
import { resolveAiProvider } from "./ai-provider.js";
import { readSiteModel, writeSiteModel } from "./site-ai-repository.js";

function database() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Database is not configured.");
  return databaseSql;
}

export function getSiteAiModel(provider = resolveAiProvider()) {
  // Read on each new reply so saved changes also apply to existing conversations.
  return readSiteModel(database(), provider);
}

export function saveSiteAiModel(provider, model, adminId) {
  return writeSiteModel(database(), provider, model, adminId);
}
