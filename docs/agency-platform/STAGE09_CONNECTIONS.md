# Stage 09 connection inventory

Recorded against baseline `3fb6cf5` before implementation changes. The primary checkout is `AI\portal` on `feat/agency-platform`.

| Connection | Existing owner and permitted resources | Credential storage | Disconnect and refresh behavior |
| --- | --- | --- | --- |
| Client Hubstaff | AOC-private deployment integration. Each client uses its saved Tasks project URL and optional Tracking project mapping. Membership and project ownership restrict client reads. Other agencies stay gated. | Server environment token or PAT seed; AES-GCM encrypted singleton rotated tokens in PostgreSQL; PAT refresh serialized under a transaction lock. | Operator-controlled seed/config replacement. Client mapping edits invalidate project/index bindings. No client token UI. |
| Internal Hubstaff | Separate Internal identity and mapped Hubstaff user. Personal OAuth uses read-only Hubstaff/Tasks scopes. Internal role/panel checks control organization-wide views. | AES-GCM encrypted access/refresh tokens on the Internal-user row; server-managed encryption secret. | Connection version, user mapping and active identity are checked during callbacks and refresh. Version-aware updates prevent stale refresh overwrites. Unlink clears local tokens and advances version. |
| Drive preparation | Active AOC Admin publisher, configured Google identity and approved parent folder. Stage 04 assigns company guidance to AOC; Stage 08 pins publication/corpus/connection approval. | AES-GCM encrypted refresh token bound to publisher, OAuth client and root folder. Expiring one-use state binds owner and portal session with PKCE. | Baseline disconnect attempts Google grant revocation, then deletes local connection/state. Existing callbacks lack a persistent disconnect/reconnect generation. Metadata checks detect connection changes and sync failures. |
| Search Console | Exact client, site, connecting user and browser session. Matching property and read-only Search Console access are required. | Separate encrypted website refresh token bound to client/site/OAuth client. PKCE verifier is encrypted; state is single-use and expires after ten minutes. | Local disconnect removes only the site's saved grant and pending states. Baseline callbacks lack an explicit agency/generation fence. Access token refresh is transient. |
| Make connection test | AOC-private deployment connection, accessible through restricted AOC Admin action. Fixed connection-test payload and configured Make HTTPS destination. | Secret webhook URL in server-managed environment. UI receives only a sanitized confirmation. | Operator changes/removes configuration. No inbound event receiver, agency workflow action or business-message delivery endpoint exists. |
| OpenAI/OpenRouter | Platform-private deployment provider settings. Client requests never select or retrieve API keys. | AES-GCM encrypted database keys with provider-associated data; server-managed encryption secret and optional server environment configuration. | Active platform operator changes provider/model configuration. Request settings are reloaded through existing server paths. No browser key retrieval or per-agency provider grant. |

The following implementation review covers agency binding, callback generations, token refresh races and secret rotation. Existing Internal Hubstaff protections are reused. Live provider behavior is pending and no real consent is requested for fixture verification.

## Implemented ownership and lifecycle

Migration 006 adds an owner-controlled connection ledger for Drive publishers and Search Console sites. Existing active AOC Drive publishers adopt the AOC agency. Existing website grants adopt their exact client ownership. Unknown owners are withheld. The ledger contains scope and a generation counter, with no credentials. Runtime can call its narrow functions and cannot select or mutate the ledger directly.

The live portal session, active client role, current agency and exact resource are resolved on the server. Encrypted Google state includes this scope and generation alongside the PKCE verifier. Callbacks consume their existing one-use session-bound state, compare current scope and validate provider read access. Credential writes and generation advancement commit together. Disconnect advances generation in the same transaction as local deletion. A reconnect or role change during exchange rejects the stale write. Client viewers retain read status/report access; managing a connection requires Client Administrator authority.

Search Console property selection preserves the generation from its property API read through the saved update. Token refreshes remain transient and are checked before provider data reads and again before returning their result. Drive background preparation checks its AOC publisher binding and generation around refresh and reads. Reconnecting Drive changes its stored connection and invalidates the old Stage 08 source approval. It does not approve new knowledge or grant another agency access.

Drive now disconnects locally, matching Search Console's scoped local removal. A rejected callback also discards its unused token locally. Google-level revocation is left to the user in Google Account permissions because revoking a shared OAuth app can affect its other uses. Drive and Search Console retain separate token rows, purposes, state stores and consent flows.

Existing ciphertext formats remain compatible. Drive encryption binds publisher/client/root, Search Console binds client/site/OAuth client, and the additional protected ledger pins the agency. Platform provider keys retain their provider-associated encryption. Internal Hubstaff keeps its version-aware identity mapping and serialized refresh implementation.

## Make and AI provider boundaries

Make remains a restricted AOC connection test with a server-configured HTTPS Make endpoint, standard port, no embedded URL username/password or fragments, and a fixed minimal payload. The confirmation returned to UI is a fixed safe message. The provider response cannot echo a webhook credential into the UI.

Every explicit manual test receives a fresh request ID and has no automatic retry. There is no inbound Make endpoint or agency business workflow in this checkout. Consequently inbound signature/replay checks and durable business-event deduplication are not enabled or claimed. Any later workflow must define signed inbound authentication, tenant-bound destinations and payload schemas, and a persisted unique provider event/delivery key before rollout. Repeated manual connection tests are separate tests.

Deployment OpenAI/OpenRouter settings remain platform-private. Active platform operators can manage them. Client and agency parameters cannot select, read or replace deployment API keys. The Stage 11 agency rollout gate stays in place. No new agency receives a Drive grant, client Hubstaff project, Internal Hubstaff identity, Make destination or source approval by subscription.

## Managed secrets and rotation

Existing encryption uses AES-256-GCM with random nonces, server-managed secrets and existing scope-associated data where present. No token or encrypted credential is returned by the integration UI. Provider errors are reported through safe codes/messages. The deployed secret-management configuration was not changed or verified.

Use private local shell/environment settings for synthetic tests and Vercel server environment secrets for an approved deployment. Keep migration credentials outside web/Python runtime. Use the matching secret values on both services only where that subsystem already shares encryption or signing.

1. Name the approved target and stores to rotate. Schedule a window that stops callbacks, refreshes, source workers and credential writers.
2. Retain the old secret securely with an encrypted database backup. Inventory row counts and ownership without printing credentials.
3. In a reviewed operator transaction, decrypt with the old key and reseal with the new key using the same resource-associated data. Include provider settings, Drive source indexes/tokens and Search Console grants when their shared key is rotated. Internal Hubstaff and deployment PAT stores use their own key.
4. Delete outstanding OAuth state and restart browser consent attempts. Do not migrate a partially completed callback across the rotation.
5. Update the managed server secret, restart the affected runtimes and clear their memory caches. Keep writers stopped until the new configuration and re-encrypted rows agree.
6. Verify ownership, row counts and scoped decryption without emitting values. Run fixtures, then any separately approved named provider check. Reopen writers after validation.
7. If validation fails before reopening, restore the encrypted rows and old secret together. After reopening, preserve intervening writes during recovery. Provider-side revoked grants require the account holder to reconnect.

This is a rotation plan. Live rotation and restore were not performed in Stage 09.

## Private configuration and consent

| Integration | Existing server-only names | Required account action for a later live check |
| --- | --- | --- |
| App/session and migration | DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET; operator-only AGENCY_MIGRATION_DATABASE_URL and AGENCY_WORKSPACE_TEST_DATABASE_URL | Choose an approved target and actual runtime role. |
| Drive | GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY, GOOGLE_DRIVE_ALLOWED_EMAIL, GOOGLE_DRIVE_ROOT_FOLDER_ID | Confirm the test Google identity and parent folder. Authorize openid, email and https://www.googleapis.com/auth/drive.readonly. Redirect is BETTER_AUTH_URL + /api/admin/source-connections/callback. Google grants read scope beyond one folder; the server restricts eligible descendants of the configured parent. |
| Search Console | WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID, WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET, WEBSITE_INSIGHTS_ENCRYPTION_KEY; existing Drive app/encryption configuration can be the configured fallback | Confirm the test website and property. Enable Search Console API and consent to https://www.googleapis.com/auth/webmasters.readonly. Redirect is BETTER_AUTH_URL + /api/client/website-insights/google/callback. The account holder completes sign-in and selects a matching accessible property. No Drive token is reused. |
| Client Hubstaff | HUBSTAFF_ACCESS_TOKEN or HUBSTAFF_PAT_REFRESH_TOKEN with HUBSTAFF_TOKEN_ENCRYPTION_KEY | Confirm a read-only test organization/project and the permitted fixture client mapping. |
| Internal Hubstaff | HUBSTAFF_OAUTH_CLIENT_ID, HUBSTAFF_OAUTH_CLIENT_SECRET, HUBSTAFF_OAUTH_REDIRECT_URI, HUBSTAFF_TOKEN_ENCRYPTION_KEY | Confirm the mapped Internal test identity. Consent to hubstaff:read tasks:read. Redirect is BETTER_AUTH_URL + /api/internal/hubstaff/oauth/callback. |
| Make | MAKE_WEBHOOK_URL | Explicitly approve the test scenario and fixed connection-test payload before a real request. |
| AI providers | PROVIDER_SETTINGS_SECRET plus existing server-managed provider configuration/environment keys | Explicitly approve a small named model request before a live AI check. Never paste API keys in chat. |

The primary environment file contains the app/session, Drive, Hubstaff, Make and provider-encryption entries. Presence was checked without reading values into the report. The three optional WEBSITE_INSIGHTS_* settings and both AGENCY_* test/migration URLs are absent/empty. Search Console may use its documented app/encryption fallbacks. Absence does not prove an integration is broken, and presence does not prove provider access.

No live check is required for this stage's local authorization tests. Before any future live check, ask the user which test accounts, resources and redirect URLs to use. The account holder completes sign-in and consent privately. Passwords and tokens must stay out of chat.

## Remaining verification

The recorded Google revocation window carries forward. A portal disconnect, generation change, source disable or recorded failure blocks subsequent application use. A permission revoked directly at Google is detected on a provider read/source check or the existing 15-minute source freshness boundary. Previously delivered bytes and provider-submitted material cannot be recalled.

Pending work includes live Google and Hubstaff consent/refresh checks, live AI, managed-secret rotation/restore, inbound Make workflow design if later authorized, Stage 06 browser verification and live CDN/header checks. The legacy application credential retains its existing backing-table privileges. The ledger's policies protect its direct runtime table access; this is not a claim of RLS isolation for all legacy credential tables.
