import "server-only";
import { driveConnectionStatus, discoverConnectedSources, previewConnectedSource } from "./drive-source-service.js";
import { driveConfiguration } from "./drive-source-policy.js";
import { createAutomaticSourceLoader, sourceConnectionBinding } from "./drive-source-auto.js";

const sources = createAutomaticSourceLoader({
  getBinding: async ownerId => sourceConnectionBinding(await driveConnectionStatus(ownerId), driveConfiguration().clientId),
  listSources: discoverConnectedSources,
  readSource: previewConnectedSource,
});

export const loadAutomaticSourceContext = sources.load;
export const clearAutomaticSourceCache = sources.clear;
