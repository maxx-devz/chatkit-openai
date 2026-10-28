# Admin-managed AI providers

Run `npm run site-ai:migrate` once against this deployment's database.
Run `npm run integration-audit:migrate`, then `npm run admin-audit:migrate`;
saving settings requires its audit tables (and the integration-audit prerequisite).
The panel identifies a missing prerequisite and blocks saving until it is ready.
Deploy both the Next.js portal and Python backend. Both must use the same
deployment database and PROVIDER_SETTINGS_SECRET (a stable random secret of at
least 32 characters). Back up the secret: losing it makes saved keys unreadable.

In **AOC Admin → AI provider settings**, choose OpenAI or OpenRouter. Enter the
provider key (or leave blank to reuse its saved key), click **Verify & load models**,
choose a model, optionally select reasoning effort, and **Save & activate**.
Saving checks authenticated model metadata only: it does not send a synthetic
generation request or consume generation tokens. No client content is sent.
Metadata/configuration failures leave the active settings unchanged. Saving does
not guarantee the account can fund or run the next chat request.
The choice applies
to the next reply in admin chat, client ChatKit conversations (including existing
ones), and Assistant Settings draft previews. Replies already running finish
with the model they started with. Selecting a dropdown option alone does not save.

Options show the display name alongside the exact provider model ID, for example
`GPT 6 luna — gpt-6-luna`. Only the catalog ID is submitted and saved, never the
display name. IDs must belong to a freshly verified provider catalog and support
tools. After saving, the notice shows the ID confirmed by the settings server.

OpenAI models come from the authenticated `/v1/models` list. OpenRouter's public
catalog is intersected with authenticated `/api/v1/models/user` eligibility;
models excluded by account routing/privacy/guardrails are disabled with a reason.
Retired models and models without required tool support are also disabled.
Listed-but-untested models are labeled explicitly: a catalog does not establish
API billing, quota, or inference permissions, and a ChatGPT subscription is not
an API entitlement. Client runtime uses OpenAI Responses or OpenRouter Chat
Completions; saving does not call either generation endpoint.

Temporary rate limits do not disable a catalog-listed model. Old synthetic-test
results no longer override the model catalog. Retired/account-policy-excluded
and tool-incompatible entries remain disabled to preserve portal functionality.
Only curated error reasons are exposed, never raw provider errors or keys.

## Simple reasoning controls

Auto omits optional reasoning parameters and preserves provider defaults. Low,
Medium and High are enabled for documented GPT-6 Luna IDs, including dated
snapshots, and OpenRouter models whose `reasoning.supported_efforts` metadata
explicitly exposes the chosen effort. Unknown models and dynamic routers keep
Auto. These are reasoning controls, not service tiers, subscriptions or quota
upgrades. Higher effort can increase output-token usage and latency.

Settings are stored as model-bound `generation_options` JSONB in the existing
`portal_site_ai_settings` table. Rerun `npm run site-ai:migrate` for the additive
column; current keys/models are preserved. Runtime reads remain compatible with
the old schema and use defaults until configured. Switching the model elsewhere
does not accidentally apply options belonging to an old model.

Client Work questions, General chat, builder previews and the AOC Admin assistant
apply the saved effort on subsequent requests. Specialized image/indexing models
and Internal Portal features are unchanged. OpenAI sends `reasoning.effort`;
OpenRouter client chat uses its documented `reasoning` extension. Arbitrary
provider parameters are not accepted through these settings.

Each provider remembers its own key and model. Keys are encrypted server-side in
`portal_ai_credentials`, never returned to the browser or stored in localStorage.
Only the last four characters are shown. `portal_ai_active_provider` selects the
site-wide provider; `portal_site_ai_settings` retains its model and options. Changes are not
cached across replies. Switching tabs alone does not activate that provider.

The old API key/model environment variables are legacy fallbacks only. For a local
migration, set PROVIDER_SETTINGS_SECRET, then run
`node scripts/import-provider-settings.mjs`. It encrypts and verifies existing
credentials without overwriting different saved keys or deleting local values.
In this workspace the existing keys were imported and the four old AI key/model
entries removed from .env.local after verification.

On Vercel, set the SAME PROVIDER_SETTINGS_SECRET on both services before redeploying
both. If using the migrated database, keep the exact existing encryption secret.
For a new database, run the schema migration and add keys through its own admin UI.
Keep staging and production databases and secrets separate.

## Database bootstrap

DATABASE_URL remains a deployment setting: the portal needs it before login and
before it can read settings. Storing it only in that same database would prevent
startup. The admin panel shows connection status, not a live database editor.
Moving databases requires deployment configuration and an explicit data migration;
changing a URL does not copy existing clients or conversations. Other auth,
ChatKit and Hubstaff settings remain unchanged.

This setting controls conversational models. Image generation and file indexing
retain their specialized models. OpenAI-hosted images and library indexing require
a genuine OpenAI key saved in Admin, even when chat uses OpenRouter. Changing the
OpenAI key's project does not migrate existing OpenAI files or vector stores.
OpenRouter's catalog includes labeled free and paid models; choices without tool
support cannot be applied site-wide. Provider
availability, account restrictions, and rate limits can still reject a request.
`openrouter/free` is a router: choosing it shares that routing policy site-wide,
but OpenRouter may select different underlying models per request. Choose a
specific model for a consistent model ID.

OpenRouter can also return HTTP 404 when account privacy/guardrail settings
exclude all candidate endpoints. The client reports this as a policy restriction,
not exhausted credits or a missing model. Select a compatible model; changing
privacy settings is a separate account decision, not something this app bypasses.

Before the additive migration, chat continues using the environment fallback.
Other database failures are surfaced rather than silently changing the model.

References: [OpenAI key security](https://developers.openai.com/api/docs/guides/production-best-practices),
[OpenAI models](https://developers.openai.com/api/reference/resources/models/methods/list),
[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens),
[OpenRouter models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties).
