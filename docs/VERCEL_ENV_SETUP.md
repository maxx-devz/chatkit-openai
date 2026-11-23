# Vercel environment setup — 2026-11-23

## Saved settings

Authorized team: `maxx-b007`. Production settings are saved for both
`chatkit-openai-portal` (Next.js) and `chatkit-openai` (Python). Preview settings
are saved specifically for the `client-documents` branch. Other Preview branches
and Development settings are preserved, including old opaque shared credentials.

The approved local runtime values were imported as Config or Secret, verified
against Vercel environment metadata. No credential values are recorded here.
Production/Preview origins were resolved separately. The Vercel `DATABASE_URL`
uses the approved Supabase runtime login, `sslmode=verify-full`, and
`sslrootcert=config/database/supabase-root-ca.crt`. The Node pool limit is 1.
Operator/migration URLs, database administrator passwords, private test accounts,
and `.env` files were excluded. No schema migration was needed for this increment.
Local `.env.local` was not changed. Neon was not queried or modified.

Server debugging, body capture and local watcher flags are disabled in Vercel.
Local watchers are not a production scheduler. Existing stable encryption values
were copied without regeneration so they match the approved Supabase settings.
Production auth signing configuration now uses the approved local value; users
may need to sign in again after deployment. Preview and Production use the same
approved database: Preview application writes therefore affect the same records.
All automated fixture tests must continue to use disposable databases.

## Required source files before deployment

Deploy the current source with all of these files together:

- `config/database/supabase-root-ca.crt`
- `chatkit_backend/config/database/supabase-root-ca.crt`
- `next.config.mjs` with `outputFileTracingIncludes` for the public certificate
- `.vercelignore`, including `.tmp`, `.env*`, and other private/build directories

The certificates are public CA certificates, not private keys. Both copies are
necessary because the Python Vercel project's root is `chatkit_backend` while
the frontend project's root is the repository root. The relative certificate
path must resolve from each deployed runtime root. Do not redeploy the older
remote revision without these files: its bundle does not contain the certificate.

Environment imports do not update existing deployments. No deployment, push or
commit was performed by this setup step. Publish the reviewed source through the
normal Git workflow, deploy Python first, then the portal. Check each deployment's
build output and authenticated database-backed login after it is deployed.

## Public origins

| Environment | Portal | Python backend |
| --- | --- | --- |
| Production | `https://chatkit-openai-portal.vercel.app` | `https://chatkit-openai-tau.vercel.app` |
| client-documents Preview | `https://chatkit-openai-portal-git-client-documents-maxx-b007.vercel.app` | `https://chatkit-openai-git-client-documents-maxx-b007.vercel.app` |

Use those portal origins for `BETTER_AUTH_URL` and the matching backend origin
for `CHATKIT_BACKEND_URL`; no localhost origin was uploaded. The public ChatKit
domain key is configured, but provider-side registration of these domains is a
separate live check. Keep `CHATKIT_BACKEND_SECRET` and
`PROVIDER_SETTINGS_SECRET` aligned between the two services.

## Verification and pending work

- Passed: actual Node connector with the deployment-format URI and public CA;
  read-only `SELECT 1` only.
- Passed: actual Python connector with that URI from its deployment root;
  read-only `SELECT 1` only. The local Windows check used a Selector event loop.
- Passed: isolated Next.js production build with private environment values
  shadowed; the built authentication function trace includes the public CA file.
- Passed: imported variable names, targets, branch scope and Config/Secret types
  checked against remote metadata for both services.
- Existing Python Production `/health` responds with the expected health JSON.
  This is the old deployment and does not prove its database or AI configuration.
- Passed after explicit user approval: configured a Python project automation
  bypass and stored it as the server-only portal Secret
  `CHATKIT_VERCEL_PROTECTION_BYPASS`, scoped to `client-documents` Preview.
  Without the header, Preview health redirects to Vercel sign-in (302). With the
  credential, it returns the expected application health JSON (200). Vercel
  sign-in protection remains enabled. An unsigned empty `/chatkit` probe reaches
  the existing application but returns 503, `Backend is not configured`, with
  private/no-store headers. That deployment predates the imported backend secret.
  The configuration guard returns before database/AI work; no conversation or
  message was created. Application signatures remain implemented in source, but
  their deployed 401 behavior and a successful signed interaction remain pending
  until the new environment is deployed. Both projects need the prepared source
  and public certificates; the portal also needs its newly saved Secret. This Vercel
  automation credential applies to the Python project, not just one deployment;
  only the portal's client-documents Preview receives its value. Application
  signatures and per-client authorization remain required.
- Pending: deploy current source, verify TLS/database from Vercel, log in with the
  user's existing authorized account, and verify a small authorized AI request.
  No live AI requests, real messages, billing actions or document releases ran.
- Pending: OAuth callback registration/consent for any enabled live integrations.
  The existing Internal Portal `HUBSTAFF_OAUTH_REDIRECT_URI` still points to a
  local callback; it was intentionally not altered by this Client Portal setup.
  Production Internal Portal OAuth will require its own approved callback setup.
- Pending only if scheduling is required: set `SOURCE_SYNC_SECRET` and
  `HUBSTAFF_INDEX_SYNC_SECRET` (or supported `CRON_SECRET`) privately and configure
  an actual protected scheduler. No scheduler was enabled by this task.

The current approved-link Document Library needs no
`CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID`, `CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET`,
`CLIENT_DOCUMENTS_ENCRYPTION_KEY` or `CLIENT_DOCUMENTS_ALLOWED_EMAIL`. Those are
only for the optional protected Google-download path. Never invent OAuth values;
configure them privately and perform consent only if that separate path is used.

Private import results are retained locally in the ignored, access-restricted
`.tmp/vercel-env-import/` folder. Never commit, attach or deploy that directory.
The public files above are the only certificate material intended for Git.

References: [Vercel environment deployment behavior](https://vercel.com/docs/environment-variables/managing-environment-variables),
[Supabase PostgreSQL TLS](https://supabase.com/docs/guides/database/connecting-to-postgres).
