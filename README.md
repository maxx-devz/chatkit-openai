# AOC-GPT Client Portal Prototype

A Vercel-ready Next.js client portal with a private AOC AI assistant, Neon
Postgres chat history, and username/password login. It uses JavaScript only;
there is no Python server to deploy.

## What works now

- AOC-branded client login with no public registration page.
- Passwords hashed by Better Auth and database-backed session cookies.
- Dynamic clients such as ChurchBanners, CWR Enviro, and GolfBrands.
- Membership checks on the portal, model list, chat, and history APIs.
- Per-client AI instructions and optional per-client OpenAI vector stores.
- Saved folders, branches, user prompts, AI replies, errors, assets, model
  metadata, and token usage in Neon.
- A model picker based on the models available to the server's OpenAI API key.
- Streaming answers and image-generation progress/error details.
- A production build that can be deployed as one Next.js Vercel project.

The dashboard metrics and project cards are still prototype content in
`config/portal.js`. The signed-in client name, username, AI memory, and chat
history are dynamic.

## Important security behavior

The username does not decide database access by itself. After login, every
server request checks the authenticated Better Auth user ID against
`portal_memberships`. A user can read and save data only for an assigned
client. If Neon cannot be reached, the app does not display old browser-local
history, which avoids leaking one client's chats on a shared device.

Passwords are stored only in Better Auth's authentication tables as hashes.
Do not type or replace a password directly in Neon. A value such as
`churchbanners123` is acceptable only for local testing and must be replaced
before a real client receives access.

## Requirements

- Node.js 20.9 or newer (Node.js 22 LTS recommended).
- npm.
- A Neon Postgres database.
- An OpenAI API key from <https://platform.openai.com/api-keys>.

OpenAI API billing is separate from a ChatGPT Free, Plus, Business, or
workspace subscription.

## Local setup, step by step

### 1. Open the project

```powershell
cd "C:\Users\AOC-DEV 2\chatkit\chatkit-nextjs"
```

### 2. Install packages

```powershell
npm install
```

### 3. Copy the Neon connection string

In Vercel, open **Storage**, select the `neon-postgres` database, then choose
**Open in Neon** or **Connect to Project**. Copy the pooled connection string
named `DATABASE_URL`. It begins with `postgresql://`.

The database URL contains a password. Never paste it into chat, screenshots,
source code, or Git.

### 4. Configure `.env.local`

The project already ignores `.env.local` in Git. Open it and make sure these
five values exist:

```dotenv
OPENAI_API_KEY=sk-your-new-api-key
OPENAI_MODEL=gpt-5.4-mini
DATABASE_URL=postgresql://your-neon-connection-string
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=http://127.0.0.1:3000
```

Generate a secure local auth secret in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copy the printed value into `BETTER_AUTH_SECRET`. Do not reuse the production
secret locally. `BETTER_AUTH_URL` must exactly match the browser origin, so use
`127.0.0.1`, not `localhost`, for this project.

If the OpenAI key previously appeared in chat or a screenshot, revoke it and
create a new one before deployment.

### 5. Create the authentication tables

Run this once for the Neon database:

```powershell
npm run auth:migrate
```

This uses Better Auth's official migration API to create its user, account,
session, verification, and username fields. It is safe to run again; it reports
when the schema is already up to date.

### 6. Create the AOC portal tables

Run:

```powershell
npm run portal:migrate
```

This applies `database/schema.sql` to the configured Neon database. It is safe
to run again. You can alternatively install it manually:

1. Open the Neon **SQL Editor**.
2. Open `database/schema.sql` from this project.
3. Copy the entire file into the SQL Editor.
4. Select **Run**.

These tables store clients, portal memberships, saved workspaces, and reviewed
client knowledge. This script is also safe to run again.

### 7. Create test client logins

Run the command with a username and display name. The password prompt is hidden
and asks twice:

```powershell
npm run client:create -- churchbanners ChurchBanners
```

For your current test, enter `churchbanners123` when prompted. The command will
warn that it is weak but will hash and save it.

Create another dynamic client the same way:

```powershell
npm run client:create -- cwrenviro "CWR Enviro"
npm run client:create -- golfbrands GolfBrands
```

For testing, you can enter `cwrenviro123` for CWR Enviro. Each command creates:

1. one Better Auth login;
2. one `portal_clients` row;
3. one `portal_users` row linked to the authentication ID; and
4. one `portal_memberships` assignment.

There is no web-based sign-up route, so a visitor cannot create their own
account or assign themselves to a client.

### 8. Start the portal

```powershell
npm run dev
```

Open <http://127.0.0.1:3000>. Sign in with the client username and password.

### 9. Verify isolation and saved history

1. Sign in as `churchbanners`.
2. Create a folder, send a message, and wait for the complete AI answer.
3. Sign out.
4. Sign in as `cwrenviro`. ChurchBanners chats must not appear.
5. Sign out and return to `churchbanners`. Its folder and both sides of the
   conversation should return.

To inspect the saved workspaces in Neon without showing message content:

```sql
SELECT
  clients.slug,
  users.display_name,
  snapshots.revision,
  snapshots.updated_at
FROM portal_workspace_snapshots AS snapshots
JOIN portal_clients AS clients ON clients.id = snapshots.client_id
JOIN portal_users AS users ON users.id = snapshots.user_id
ORDER BY snapshots.updated_at DESC;
```

## How the dynamic client flow works

```text
Client signs in
  -> Better Auth verifies the password hash and session
  -> server finds that user's portal membership
  -> server selects only an assigned client
  -> chat loads that client's instructions and approved vector store
  -> prompts and AI replies save under that client + user
```

The provisioning command initially uses the username as the client slug. That
does not make the system static. Each account and membership is a database row,
and new clients do not require a source-code change. An AOC administrator can
later assign one staff user to multiple clients; the header automatically shows
a validated client selector when more than one membership exists.

## Client instructions and knowledge

Global AOC behavior is in `config/assistant.js`. Client-specific instructions
are stored in Neon:

```sql
UPDATE portal_clients
SET assistant_instructions =
  'Help ChurchBanners with its ecommerce website and approved project records. Use a concise, friendly tone. If evidence is missing, say so.'
WHERE slug = 'churchbanners';
```

For searchable documents, create a separate OpenAI vector store for each
client, upload only approved documents, and save that client's vector store ID:

```sql
UPDATE portal_clients
SET openai_vector_store_id = 'vs_your_client_vector_store_id'
WHERE slug = 'churchbanners';
```

The chat route can then use OpenAI File Search only with that selected client's
vector store. The ChatGPT/AOC-GPT workspace folders shown in ChatGPT are not an
API database and are not automatically accessible to this portal.

Chat history does not automatically train or permanently teach the OpenAI
model. History provides conversation continuity. Durable client facts should
enter `portal_knowledge_items` as pending, be reviewed by AOC, and only then be
published to the client's retrieval store.

## Deploy to Vercel

### 1. Prepare the database locally

Point local `.env.local` at the same Neon database connected to Vercel, then
run:

```powershell
npm run auth:migrate
```

Run `database/schema.sql` in Neon and create the test clients before or after
deployment. Because the commands connect to remote Neon, accounts created
locally are immediately available to the Vercel app using that same database.

### 2. Import the private repository

1. Push this project to a **private** Git repository.
2. In Vercel, select **Add New → Project**.
3. Import the repository.
4. Keep the detected framework as **Next.js**.

Do not upload `.env.local`.

### 3. Add Vercel environment variables

In the Vercel project, open **Settings → Environment Variables** and add:

| Name | Production value |
| --- | --- |
| `DATABASE_URL` | The pooled Neon connection string/integration value |
| `BETTER_AUTH_SECRET` | A new 32+ byte random value used only in production |
| `BETTER_AUTH_URL` | The exact HTTPS portal origin, with no trailing slash |
| `OPENAI_API_KEY` | A fresh server-side OpenAI API key |
| `OPENAI_MODEL` | `gpt-5.4-mini` or another model available to the API project |

Example `BETTER_AUTH_URL`:

```text
https://your-project-name.vercel.app
```

If you add or change an environment variable after a deployment, redeploy so
the new value is used. For a real client launch, use the stable custom portal
domain as `BETTER_AUTH_URL`.

### 4. Deploy and test two accounts

Deploy, open the production URL, and repeat the isolation test from local setup
step 9. Also confirm:

- unauthenticated `/`, `/api/chat`, `/api/models`, and `/api/workspace`
  requests are rejected;
- signing out prevents the Back button from reopening private data;
- ChurchBanners and CWR Enviro never see each other's folders or answers; and
- the OpenAI API key and database URL never appear in browser developer tools.

Vercel hosting improves operational security, but it does not make an
application automatically secure. Keep Vercel and Neon accounts protected with
MFA, use least-privilege team access, rotate secrets, enable rate limiting
before a public launch, and add audit logs and password reset/change tools
before onboarding real clients.

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run auth:migrate` | Create or update Better Auth tables in Neon. |
| `npm run portal:migrate` | Create or update the AOC portal tables in Neon. |
| `npm run client:create -- USERNAME "DISPLAY NAME"` | Privately create one client login and membership. |
| `npm run dev` | Run at `http://127.0.0.1:3000`. |
| `npm run lint` | Check source code. |
| `npm run build` | Verify the Vercel production build. |
| `npm start` | Run the completed production build locally. |

## Main files

- `lib/auth.js` — Better Auth, password, username, and session configuration.
- `lib/portal-data.js` — authenticated membership and tenant data layer.
- `app/login/page.js` — private client login screen.
- `app/api/auth/[...all]/route.js` — Better Auth HTTP handler.
- `app/api/chat/route.js` — authenticated OpenAI Responses API route.
- `app/api/workspace/route.js` — authenticated Neon chat-history route.
- `scripts/create-client.mjs` — private local client provisioning command.
- `database/schema.sql` — AOC portal schema.
- `config/assistant.js` — global server-side assistant instructions.
- `config/portal.js` — prototype dashboard content and assistant panel size.

## Current prototype limitations

- Dashboard hours, goals, and project cards are not yet loaded from AOC project
  systems.
- There is no AOC administrator UI yet; client creation uses a local command.
- There is no client password-change/reset screen yet. Do not edit password
  hashes manually in Neon; add an authenticated Better Auth change/reset flow.
- File uploads need private object storage, size/type validation, malware
  scanning, tenant authorization, and retention policies before client use.
- Rate limiting, audit logs, MFA, account lockout policy, legal/privacy review,
  and automated tenant-isolation tests are still required for production.
- The UI is a custom React interface using the OpenAI Responses API. It does not
  currently use `@openai/chatkit-react` or the ChatKit server protocol.

Official references:

- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth username plugin](https://better-auth.com/docs/plugins/username)
- [Better Auth PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql)
- [Better Auth database migrations](https://better-auth.com/docs/concepts/database)
- [Connect Vercel and Neon](https://neon.com/docs/guides/vercel-manual)
- [OpenAI File Search](https://developers.openai.com/api/docs/guides/tools-file-search)
