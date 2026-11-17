# OpenRouter in AOC Admin

1. Open AOC Admin → AI provider settings and choose **OpenRouter**.
2. Paste an inference API key, or leave the field blank to reuse the encrypted saved key.
3. Click **Verify & load models**. This performs metadata GETs only: key information,
   the public catalog and the account-filtered catalog. No prompt is generated.
4. Keep **Show free models only** checked for free-allowance model IDs. Search by
   name/ID if needed. A specific allowed free model gives a more consistent choice
   than `openrouter/free`, which selects a model randomly for each request.
5. Save the configuration. Only the exact model ID is sent to the backend. A
   successful save confirms metadata, not a successful generation or future capacity.

The quota shown is the provider's account-wide daily free-request allowance,
not the portal's separate per-client monthly request limit. Missing provider
counters remain unknown. A key's remaining USD spending cap is not its balance.

## Privacy/routing 404

A valid key and unused quota can still receive `provider_policy_restricted`.
OpenRouter rejects a request when no eligible endpoint meets its privacy, ZDR,
guardrail or provider restrictions. The public catalog is not an access guarantee;
the account-filtered catalog is a better starting point, not a generation test.
The Free Router is disabled if no specific account-allowed, tool-capable free
model is listed. Tool support is taken from provider metadata, not assumed.

Review [account privacy](https://openrouter.ai/settings/privacy) and key/workspace
restrictions, then refresh models. Choose another allowed model if needed. Do
not enable training, turn off ZDR, or bypass company policies simply to get a
free route. The portal does not change these account settings. If no suitable
free endpoint satisfies the approved policy, free inference may not be possible.

## Features and limits

- Existing streamed text replies, scoped portal function tools and usage tracking
  stay on OpenRouter's OpenAI-compatible Chat Completions path.
- Model search, free/paid labels, account-filtered eligibility, quota checks and
  optional metadata-confirmed reasoning controls are available in the admin form.
- `openrouter/free` and `:free` inference requests carry zero maximum prompt,
  completion, request and image prices. There is no portal-added paid fallback or
  automatic retry. This cap does not cover independently enabled OpenAI image/file
  tools; those retain their separate permissions, configuration and billing.
- OpenRouter is a routing service, not a promise that every provider/model/feature
  is free or open source. Plugins, web search, image generation, hosted tools,
  caching and other model-specific features must not be advertised as universally
  free. They are not automatically enabled by adding a key.
- No schema migration or additional required environment variable is introduced.
  The portal and Python backend must still share the database and stable provider
  encryption secret. Restart the Python backend after deploying request changes.

References checked October 30, 2026:
[Free Router](https://openrouter.ai/docs/guides/routing/routers/free-router),
[limits](https://openrouter.ai/docs/api_reference/limits),
[current key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key),
[provider routing and max price](https://openrouter.ai/docs/guides/routing/provider-selection),
[ZDR](https://openrouter.ai/docs/guides/features/zdr).
