import { DriveSourceError } from "./drive-source-policy.js";
import { SOURCE_TEST_INSTRUCTIONS, SOURCE_TEST_LIMITS, validateSourceTestRequest, sourceTestProvider,
  prepareSourceTestDocuments, sourceTestResult } from "./drive-source-test-policy.js";

// Private-test abuse protection only: process-local, not a distributed production quota.
function createGuard() {
  const runs = new Map();
  return ownerId => {
    const now = Date.now();
    for (const [key, value] of runs) if (value.until < now) runs.delete(key);
    if (runs.has(ownerId)) throw new DriveSourceError("source_test_busy", "A private test is running or was just submitted. Wait 30 seconds before retrying.", 429);
    if (runs.size >= 200) throw new DriveSourceError("source_test_busy", "Private tests are busy. Try again shortly.", 429);
    const run = { until: now + 120_000 };
    runs.set(ownerId, run);
    return () => { run.until = Date.now() + 30_000; };
  };
}

export function createPrivateSourceTester({ getProvider, readSource, loadAutomaticContext, generate, recordUsage = async () => {} }) {
  const acquire = createGuard();
  return async (ownerId, body, { signal } = {}) => {
    const input = validateSourceTestRequest(body);
    signal?.throwIfAborted();
    const provider = await getProvider();
    const publicProvider = sourceTestProvider(provider);
    if (input.provider !== provider.id || input.model !== provider.model) {
      throw new DriveSourceError("source_test_provider_changed", "The AI provider or model changed. Reload and authorize the current destination before testing.", 409);
    }
    const release = acquire(ownerId);
    try {
      let automatic;
      let documents = [];
      let selections = input.sources;
      if (input.mode === "automatic") {
        if (!loadAutomaticContext) throw new DriveSourceError("automatic_sources_unavailable", "Automatic source processing is not configured.", 503);
        automatic = await loadAutomaticContext(ownerId, input.question, { signal });
        documents = automatic.documents;
        selections = documents.map(doc => ({ id: doc.id, version: String(doc.version), role: "instruction_simulation" }));
      } else {
        for (const selection of selections) {
          signal?.throwIfAborted();
          documents.push(await readSource(ownerId, selection.id, { expectedVersion: selection.version, signal }));
        }
      }
      const sources = prepareSourceTestDocuments(selections, documents);
      signal?.throwIfAborted();
      const startedAt = new Date().toISOString();
      let response;
      try {
        response = await generate(provider, {
          model: provider.model, instructions: SOURCE_TEST_INSTRUCTIONS, store: false, stream: false,
          max_output_tokens: SOURCE_TEST_LIMITS.outputTokens,
          input: [{ role: "user", content: JSON.stringify({ source_documents: sources, source_directory: automatic?.directory,
            source_sync: automatic?.sync, test_question: input.question }) }],
        }, { signal });
        signal?.throwIfAborted();
        const result = sourceTestResult(response, sources);
        await recordUsage(startedAt, response.usage, { code: "ready", model: provider.model, provider });
        return { ...result, provider: publicProvider, checkedAt: new Date().toISOString(), privateTest: true, published: false,
          mode: input.mode || "manual", ...(automatic ? { sync: automatic.sync } : {}) };
      } catch (error) {
        await recordUsage(startedAt, response?.usage || null, { code: "source_test_failed", model: provider.model, provider });
        throw error;
      }
    } finally { release(); }
  };
}
