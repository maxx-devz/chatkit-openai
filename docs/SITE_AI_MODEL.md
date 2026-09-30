# Admin-managed AI providers

Run `npm run site-ai:migrate` once against this deployment's database.
Deploy both the Next.js portal and Python backend. Both must use the same
deployment database and PROVIDER_SETTINGS_SECRET (a stable random secret of at
least 32 characters). Back up the secret: losing it makes saved keys unreadable.

In **AOC Admin → AI provider settings**, choose OpenAI or OpenRouter. Enter the
provider key (or leave blank to reuse its saved key), click **Verify & load models**,
choose a model and **Save & activate**. The choice applies
to the next reply in admin chat, client ChatKit conversations (including existing
ones), and Assistant Settings draft previews. Replies already running finish
with the model they started with. Selecting a dropdown option alone does not save.

Each provider remembers its own key and model. Keys are encrypted server-side in
`portal_ai_credentials`, never returned to the browser or stored in localStorage.
Only the last four characters are shown. `portal_ai_active_provider` selects the
site-wide provider; `portal_site_ai_settings` retains its model. Changes are not
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
[OpenRouter models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties).
