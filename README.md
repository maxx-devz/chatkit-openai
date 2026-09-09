# AOC-GPT Client Portal

A Vercel-ready client portal for Always Open Commerce. It provides private
client login, a tenant-isolated AOC AI Assistant, saved conversations in Neon
Postgres, and an administrator dashboard for managing clients and monthly AI
allowances.

The client assistant now uses OpenAI ChatKit with a Python backend. The website
and administrator interface remain Next.js. Start with
[the ChatKit setup guide](docs/CHATKIT_SETUP.md) for local setup, credentials,
the additional database migration, and deploying the Python service on Vercel.
The older assistant remains available through `CLIENT_ASSISTANT_UI=legacy`.

## Current status

This working prototype includes:

- private username/password authentication using Better Auth;
- no public account-registration page;
- dynamic client accounts stored in Neon Postgres;
- server-side client membership and administrator authorization checks;
- ChatKit conversations with persistent history, rename, delete, and retries;
- a read-only archive of conversations from the earlier assistant;
- streaming OpenAI Responses API output;
- a server-configured model for ChatKit (the older interface retains its selector);
- global AOC instructions, per-client instructions, and optional per-client
  OpenAI vector stores;
- monthly AI request and token-usage tracking;
- an AOC administrator dashboard at `/admin`;
- per-client portal and AI Assistant enable/disable controls;
- a professional locked Assistant state when AI access is paused;
- near-real-time AI access updates on the client portal; and
- optional server-side Hubstaff project sync for monthly hours and project tasks;
- a production build compatible with Vercel serverless hosting.

When Hubstaff is configured for a client, the first two metric cards and the
Project Progress board use that client's Hubstaff project. Without a Hubstaff
project URL or server token, the portal safely shows its prototype fallback
content. “This Month at a Glance” intentionally remains prototype content for
now. Client identity, access, assistant settings, monthly usage, and saved chat
history are database-backed.

## Important implementation note

The client uses `@openai/chatkit-react` and the official Python ChatKit SDK,
connected to the Agents SDK and Responses API. Administrator screens are unchanged.
Agent Builder is being retired; this integration uses a custom server instead.
See [ChatKit setup and feature differences](docs/CHATKIT_SETUP.md) before deployment.
The older model/image-generation instructions below apply to the legacy assistant.

## Architecture

```text
Browser
  -> Next.js pages and authenticated API routes on Vercel
     -> Better Auth session tables in Neon
     -> AOC portal, membership, history, and usage tables in Neon
     -> signed request to the Python ChatKit service on Vercel
        -> ChatKit history in Neon and the existing monthly allowance tables
        -> Agents SDK / OpenAI Responses API
           -> optional client-specific OpenAI vector store
     -> optional Hubstaff API (server-side project/task/time reads)
```

The main request flow is:

```text
Client signs in
  -> Better Auth verifies the password and session
  -> the server finds the authenticated user's client membership
  -> the server selects only that assigned client
  -> the chat route loads global and client-specific instructions
  -> OpenAI processes the request
  -> the client workspace saves prompts and replies in Neon
```

## Security model

The typed username never decides data access by itself. Every protected server
request verifies the signed session and checks `portal_memberships` or
`portal_admins` in Neon.

- Client A cannot select Client B by changing browser data.
- Client history is stored by client ID and portal user ID.
- Client vector-store IDs are selected on the server after authorization.
- OpenAI and database credentials remain server-only.
- If the database is unavailable, the application does not fall back to
  another client's browser-local history.
- Passwords are hashed and owned by Better Auth. They are not stored in the AOC
  portal tables.

Never commit `.env.local`, API keys, database URLs, passwords, or auth secrets.
The repository already ignores `.env*` except `.env.example`.

If a credential has appeared in a chat, screenshot, issue, commit, or shared
document, revoke or rotate it before using the portal with real clients.

## Requirements

- Node.js 22 or newer (required by the installed OpenAI SDK).
- Python 3.13 for the ChatKit backend.
- npm.
- A Neon Postgres database.
- An OpenAI API key from <https://platform.openai.com/api-keys>.
- A Vercel account for production deployment.

OpenAI API quota and billing are separate from ChatGPT Free, Plus, Business,
Enterprise, or workspace subscriptions.

## Fresh local setup

Follow these steps in order for a new computer or a new database.

### 1. Open the project

```cmd
cd "C:\Users\AOC-DEV 2\chatkit\chatkit-nextjs"
```

### 2. Install dependencies

```cmd
npm install
```

### 3. Create `.env.local`

Copy `.env.example` to `.env.local`, then provide real server-side values:

```dotenv
OPENAI_API_KEY=sk-your-new-api-key
OPENAI_MODEL=gpt-5.4-mini
DATABASE_URL=postgresql://your-pooled-neon-connection-string
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=http://127.0.0.1:3000
# Optional: server-only Hubstaff organization access token
HUBSTAFF_ACCESS_TOKEN=
# Optional fallback when a project has no monthly hours budget
HUBSTAFF_MONTHLY_HOURS_DEFAULT=
```

Use the exact name `DATABASE_URL`. Do not rename it to `env_DATABASE_URL` or
another variation.

Generate a local Better Auth secret with:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use a different secret in production. `BETTER_AUTH_URL` must exactly match the
browser origin and must not have a trailing slash. This project uses
`http://127.0.0.1:3000` locally, not `http://localhost:3000`.

Use the pooled Neon connection string for `DATABASE_URL`. It normally contains
`-pooler` in the hostname.

`HUBSTAFF_ACCESS_TOKEN` is optional. Leave it blank while the Hubstaff
integration is not in use. Never prefix it with `NEXT_PUBLIC_`: the token must
remain on the server and must not be sent to a browser. The fallback hours
value is also optional; leaving it blank makes the remaining-hours card show an
em dash when the Hubstaff project has no monthly hours budget.

### 4. Run all database migrations

Run these commands in this order:

```cmd
npm run auth:migrate
npm run portal:migrate
npm run admin:migrate
```

They create or update:

1. Better Auth users, accounts, sessions, verification, and username fields;
2. AOC clients, portal users, memberships, workspaces, and knowledge records;
3. administrator access, client availability controls, monthly request limits,
   and monthly usage records.

The scripts are designed to be safe to run again when their schema is already
up to date. Vercel does not automatically run these migrations during a normal
deployment.

### 5. Create the first administrator

```cmd
npm run admin:create -- aocadmin "AOC Administrator"
```

The terminal securely asks for the password twice without displaying it. Use a
unique password containing at least 12 characters.

Do not create `aocadmin` again if it already exists. Sign in with the existing
account instead.

### 6. Create client accounts

The easiest method is the administrator portal:

1. Start the app.
2. Sign in as `aocadmin`.
3. Open `/admin`.
4. Select **Add client**.
5. Enter the client name, username, temporary password, and monthly AI request
   allowance.

You can also create clients from the terminal:

```cmd
npm run client:create -- churchbanners "ChurchBanners"
npm run client:create -- cwrenviro "CWR Enviro"
npm run client:create -- golfbrands "GolfBrands"
```

The terminal asks for each password twice. Use unique passwords of at least 12
characters even though the lower-level client script permits eight.

Each client creation produces:

- one Better Auth login;
- one `portal_clients` row;
- one linked `portal_users` row; and
- one `portal_memberships` assignment.

New clients are dynamic database records. Adding a client does not require a
source-code change or another deployment.

### 7. Start development

```cmd
npm run dev
```

Open <http://127.0.0.1:3000>.

- A client login opens the client portal.
- An active AOC administrator login is redirected to `/admin`.

## Administrator dashboard

The administrator portal is available at `/admin`. An administrator can:

- create client workspaces and private client logins;
- enable or pause the complete client portal;
- enable or pause new AI Assistant requests;
- set the client's monthly AI request limit;
- reset the current monthly request count;
- review monthly request and token usage;
- edit the client display name;
- provide private client-specific assistant instructions;
- connect a client-specific OpenAI vector store; and
- review user, conversation, and knowledge totals.

Changes are saved only after selecting **Save changes**.

### Hubstaff live project sync

Each client can have one Hubstaff project URL. In **Add client** or the
selected client's controls, paste the complete URL, for example:

```text
https://tasks.hubstaff.com/app/organizations/14952/projects/803599
```

The server validates and stores a canonical allow-listed URL, then reads the
numeric organization/project IDs server-side. The client browser never
receives the Hubstaff credential. On each
authenticated client dashboard, the server requests:

- the project record (`GET /v2/projects/{project_id}`) for the name and budget;
- project tasks (`GET /v2/projects/{project_id}/tasks`) for the task board; and
- daily project activities (`GET /v2/projects/{project_id}/activities/daily`)
  for tracked seconds from the first day of the current month through today.

The dashboard fetches the data when it opens, when the tab regains focus, and
about every 30 seconds while visible. This is near-live polling, not a
WebSocket stream. Hubstaff documents that activity data can be delayed by up
to 20 minutes, so “real time” here means the portal updates automatically as
Hubstaff publishes new data.

The prototype sends UTC month boundaries. Hubstaff aggregates daily activity
by the organization's timezone, so a small difference can appear around the
first or last day of a month; make the organization's timezone the source of
truth for billing decisions.

#### Hubstaff credential setup

For this single AOC server integration, use a Hubstaff **organization access
token** created by an organization owner/manager under **Settings ->
Organization -> API tokens**. It is sent as a server-side bearer token and
should be allowed to see every project you assign to clients. Store the value
only as `HUBSTAFF_ACCESS_TOKEN` in `.env.local` and in Vercel Environment
Variables. Do not put it in a client row, a `NEXT_PUBLIC_*` variable, or a
React component.

The alternative personal-access-token flow is short-lived and requires a
refresh-token exchange. It is not implemented by this prototype; use an
organization token for the initial integration, or add a server-side token
refresh store before choosing PATs.

Hubstaff's current API documents `hubstaff:read` for API V2 and `tasks:read`
for task data when using OAuth/PAT credentials. The organization-token flow
instead acts with the assigned member's current organization permissions.

After adding the database column to an existing Neon database, run:

```cmd
npm run admin:migrate
```

Then add or edit a client in `/admin`, paste its own project URL, and select
**Save changes**. Different clients may point to different projects. If the
URL is blank, invalid, or the token cannot access that project, the client sees
the safe static fallback and a non-sensitive refresh message rather than any
Hubstaff credential or raw upstream response.

Remaining hours are calculated only from a Hubstaff project budget whose type
is `hours` and whose recurrence is monthly (or from the optional
`HUBSTAFF_MONTHLY_HOURS_DEFAULT`). A project with no monthly budget shows an
em dash for remaining hours so the portal does not invent a limit. The task
API supplies task status and metadata; if a connected integration does not
return custom board-column names, the board groups tasks into “In progress” and
“Done” instead of pretending to know the Hubstaff board layout.

### Live AI access behavior

When an administrator disables a client's AI Assistant and saves:

- the server immediately rejects new OpenAI requests for that client;
- the visible client portal refreshes its access policy every four seconds;
- returning focus to the client window triggers an immediate refresh;
- an in-progress browser request is stopped when the disabled state arrives;
- the model selector, starter prompts, composer, send button, and new-chat
  control are disabled; and
- saved conversations remain visible and are not deleted.

This is Vercel-compatible near-real-time polling, not WebSocket push. A future
high-traffic implementation should consider managed realtime notifications to
reduce repeated status checks.

The administrator configures only the monthly request allowance. There is no
client-configurable prompts-per-conversation allowance. Long conversations use
a rolling technical context window while their full saved UI history remains
in the workspace.

## Managing clients

### Create a client

Prefer **Admin portal -> Add client**. The command-line alternative is:

```cmd
npm run client:create -- CLIENT_USERNAME "Client Display Name"
```

### Delete a client

Deletion permanently removes the client record, memberships, saved workspace,
knowledge, usage records, and exclusive login. Review the username carefully:

```cmd
npm run client:delete -- CLIENT_USERNAME --confirm-delete
```

The command asks you to type `DELETE CLIENT_USERNAME` before proceeding.
`aocadmin`, active administrators, and users assigned to other clients are
protected.

### Change a password

Do not edit password hashes directly in Neon. This prototype does not yet have
a client password-change/reset screen. Until that workflow is built, provision
a replacement login through an approved administrative process.

## Assistant instructions and client knowledge

There are three different kinds of context:

1. `config/assistant.js` contains global AOC behavior, tone, boundaries, and
   known company facts. Changing it affects every client after deployment.
2. `assistant_instructions` in `portal_clients` contains private instructions
   for one client. It can be edited in the administrator portal without a code
   deployment.
3. `openai_vector_store_id` connects one approved OpenAI File Search vector
   store to one client.

The administrator portal is the preferred place to edit client instructions
and vector-store IDs. A direct SQL example for authorized maintenance is:

```sql
UPDATE portal_clients
SET assistant_instructions =
  'Use the client terminology and approved project information. If evidence is missing, say so.'
WHERE slug = 'churchbanners';
```

To connect an approved client vector store:

```sql
UPDATE portal_clients
SET openai_vector_store_id = 'vs_your_client_vector_store_id'
WHERE slug = 'churchbanners';
```

Use a separate vector store for each client and upload only approved client
documents. The ChatGPT/AOC-GPT workspace and its project folders are not an API
database and are not automatically accessible to this portal.

Saved conversations provide continuity but do not train or permanently teach
the OpenAI model. Durable facts should be reviewed and published to the
client's approved knowledge source.

## Models, images, and files

- The model selector calls `/api/models` and shows models available to the
  configured OpenAI API project.
- `OPENAI_MODEL` is the preferred fallback/default model. It does not grant
  access to a model that the API project cannot use.
- Image generation works only when the API project has access and sufficient
  API billing credit.
- A ChatGPT subscription does not supply OpenAI API credits.
- The official AOC logo and icon are approved local application assets and can
  be returned by the application without generating a new brand asset.
- General user file uploads and attachments are not enabled in this prototype.

The administrator's monthly request limit is an application allowance. It is
separate from OpenAI project quota, rate limits, and billing credit. OpenAI API
errors are displayed with available HTTP status, provider code, request ID, and
model diagnostics.

## Chat history and tenant-isolation test

Use at least two clients to verify isolation:

1. Sign in as Client A.
2. Create a folder and send a message.
3. Wait for the complete AI reply, then sign out.
4. Sign in as Client B and confirm Client A's folders and messages do not
   appear.
5. Sign out and return to Client A.
6. Confirm Client A's folder, prompt, and AI reply are restored.

To inspect saved workspace ownership without displaying message content:

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

## Verify before pushing

```cmd
npm run lint
npm run build
```

Confirm that secrets are not tracked:

```cmd
git status --short
git ls-files .env .env.local .env.production
```

The second command should print nothing.

## Push to GitHub

The current deployment branch is `master`:

```cmd
git add .
git commit -m "Update AOC client portal"
git push origin master
```

Do not use `git add -f .env.local` and do not paste secrets into a commit.

If the GitHub repository is already connected to Vercel, a push to the
configured production branch starts a deployment automatically.

## Deploy to Vercel

### First deployment

1. Push the repository to a private GitHub repository.
2. In Vercel, choose **Add New -> Project**.
3. Import the GitHub repository.
4. Keep the detected framework as **Next.js**.
5. Open **Project Settings -> Environment Variables**.
6. Add the production environment variables listed below.
7. Deploy.

### Required Vercel environment variables

| Variable | Production value |
| --- | --- |
| `DATABASE_URL` | Pooled Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | New random 32+ byte production secret |
| `BETTER_AUTH_URL` | Exact production HTTPS origin, without a trailing slash |
| `OPENAI_API_KEY` | Fresh server-side OpenAI API key |
| `OPENAI_MODEL` | Preferred model available to the API project |
| `HUBSTAFF_ACCESS_TOKEN` | Optional server-only Hubstaff organization access token |
| `HUBSTAFF_MONTHLY_HOURS_DEFAULT` | Optional fallback hours limit when no monthly project budget exists |

Example:

```text
BETTER_AUTH_URL=https://your-project-name.vercel.app
```

Use `DATABASE_URL`, even if a Vercel/Neon integration also created a variable
such as `env_DATABASE_URL`. The application reads `DATABASE_URL`.

For live Hubstaff cards, add `HUBSTAFF_ACCESS_TOKEN` to the same Vercel
environment(s) as the portal and redeploy. Do not add it as a public variable.
If you use the optional fallback, add `HUBSTAFF_MONTHLY_HOURS_DEFAULT` as a
positive number such as `15`.

Select only the environments that should use each credential. Set the
production `BETTER_AUTH_URL` for Production. A Preview deployment needs its own
stable preview origin and matching Preview value; do not reuse the production
origin for an unrelated preview URL. If an environment variable changes,
redeploy the affected environment.

### Database setup for Vercel

Vercel deployment does not create database tables. From a trusted local
terminal whose `.env.local` points to the same production Neon database, run:

```cmd
npm run auth:migrate
npm run portal:migrate
npm run admin:migrate
```

Then create the administrator and initial clients. Because these commands
connect directly to Neon, their accounts become available to the Vercel app
using that database.

### Existing Vercel deployment

For an ordinary source-code update:

1. run lint and build locally;
2. commit the changed files;
3. push to the Vercel production branch;
4. wait for the deployment status to become **Ready**; and
5. test client and administrator login.

Do not rerun migrations for every CSS or React change. Run the applicable
migration only when a database schema file changed or when setting up a new
database. Re-running the current migration scripts is safe, but it is still
better to run them intentionally.

### Production test checklist

- Client and administrator login work over HTTPS.
- The administrator is redirected to `/admin`.
- Client accounts open only their assigned workspace.
- Chat history survives sign-out and sign-in.
- Two different clients cannot see each other's history.
- Disabling AI in the admin portal locks the client's Assistant within about
  four seconds.
- Re-enabling AI restores the client interface automatically.
- Monthly request-limit changes appear on the client.
- `/api/ai-access`, `/api/chat`, `/api/models`, and `/api/workspace` reject
  unauthenticated requests.
- OpenAI and database credentials do not appear in browser developer tools.
- The OpenAI API project has separate billing credit or quota.

## Common troubleshooting

### "Login setup is incomplete"

Check that these exact Vercel variables exist:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

After adding or changing them, redeploy. `BETTER_AUTH_URL` must match the exact
site origin.

### Login works locally but fails on Vercel

Check that:

- `BETTER_AUTH_URL` uses the production HTTPS URL without a trailing slash;
- the deployment received all required variables;
- all three migrations ran against the same Neon database; and
- the login was created in that database.

### Database table or column is missing

```cmd
npm run auth:migrate
npm run portal:migrate
npm run admin:migrate
```

Make sure `.env.local` points to the intended Neon database first.

### AI Assistant says it is disabled

Sign in as an AOC administrator, select the client, enable **AI assistant**, and
choose **Save changes**. The client page should unlock automatically.

### Hubstaff cards show the fallback

Check that:

- `HUBSTAFF_ACCESS_TOKEN` exists in the environment used by the running server;
- the latest deployment was restarted after changing the variable;
- the client has a complete `tasks.hubstaff.com/app/organizations/.../projects/...` URL;
- the token's assigned Hubstaff member can access that organization/project; and
- the Hubstaff organization is on an active plan with API access.

The browser only receives a short, safe error message. The server log and the
Hubstaff response status/code identify authentication, permission, rate-limit,
or missing-project problems without exposing the token.

If the response is `HTTP 401` with `invalid_token`, check the credential type
first. A value beginning with `eyJ` is normally a PAT/OAuth JWT or refresh
token, not the direct organization token expected by this prototype. Replace
it with the `hsoat_...` organization access token, then restart or redeploy.

### Monthly allowance reached

In `/admin`, select the client and either increase the monthly request limit or
reset the current monthly usage. This does not add OpenAI billing credit.

### OpenAI quota or image generation fails

The error can be genuine even when ChatGPT works. Confirm the OpenAI API
project has billing credit, model access, and image-generation access. Review
the HTTP status, OpenAI error code, and request ID shown in the chat.

### Port 3000 is already in use on Windows

Check the port in Command Prompt:

```cmd
netstat -ano | findstr :3000
```

Only a `LISTENING` row has a process that can be stopped. Use its PID:

```cmd
taskkill /PID PID_NUMBER /T /F
```

`TIME_WAIT` rows with PID `0` are already closed connections and disappear on
their own. Do not try to kill PID `0`.

### npm install warnings

Deprecation or install-script review warnings are not automatically build
failures. Run `npm run lint` and `npm run build`, review the named dependency,
and update deliberately. Do not approve unknown install scripts blindly.

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run auth:migrate` | Create or update Better Auth tables |
| `npm run portal:migrate` | Create or update AOC portal tables |
| `npm run admin:migrate` | Create or update admin controls and monthly usage tables |
| `npm run admin:create -- USERNAME "DISPLAY NAME"` | Create an AOC administrator |
| `npm run client:create -- USERNAME "DISPLAY NAME"` | Create a client login and membership |
| `npm run client:delete -- USERNAME --confirm-delete` | Permanently delete a client after confirmation |
| `npm run list:client` | List client names, usernames, and current portal/AI status (read-only) |
| `npm run dev` | Start Next.js at `http://127.0.0.1:3000` and the local Python service |
| `npm run dev:web` | Start only Next.js; the Python service must already be running |
| `npm run chatkit:migrate` | Add ChatKit tables without changing earlier conversations |
| `npm run lint` | Run ESLint |
| `npm run build` | Create and verify the Vercel production build |
| `npm start` | Run an existing production build locally |

## Main files

| Path | Purpose |
| --- | --- |
| `app/page.js` | Protected client portal entry and admin redirect |
| `app/login/page.js` | Private login screen |
| `app/admin/page.js` | Server-protected administrator portal |
| `components/portal/client-portal.js` | Client dashboard shell |
| `components/portal/hubstaff-live.js` | Near-live Hubstaff metrics and task board |
| `components/workspace.js` | Folders, threads, persistence, model state, and live AI access refresh |
| `components/chat.js` | Chat UI, streaming events, generated assets, usage, and locked state |
| `components/admin/admin-dashboard.js` | Administrator client-control dashboard |
| `app/api/chat/route.js` | Authenticated OpenAI Responses API route |
| `app/api/models/route.js` | Authenticated available-model catalog |
| `app/api/workspace/route.js` | Authenticated Neon workspace load/save route |
| `app/api/ai-access/route.js` | Authenticated live AI access and monthly usage route |
| `app/api/hubstaff/route.js` | Authenticated server-side Hubstaff project data route |
| `app/api/admin/clients/route.js` | Protected admin client list/create/update route |
| `app/api/admin/usage/route.js` | Protected monthly usage reset route |
| `lib/auth.js` | Better Auth configuration |
| `lib/portal-data.js` | Client membership, tenant data, history, and AI allowance logic |
| `lib/hubstaff.js` | Validated Hubstaff URL parsing, API calls, and response normalization |
| `lib/admin-data.js` | Administrator authorization and client controls |
| `config/assistant.js` | Global server-side assistant instructions |
| `config/portal.js` | Prototype portal content and Assistant component sizing |
| `database/schema.sql` | Core client portal schema |
| `database/admin-schema.sql` | Administrator, AI control, and monthly usage schema |
| `scripts/` | Local migrations and account-management commands |

## Current prototype limitations

- Hubstaff sync is optional and read-only in this prototype. Without a valid
  server token/project URL, the portal uses fallback content; “This Month at a
  Glance” is intentionally static.
- Hubstaff activity data may lag, and the task API may not expose every custom
  board-column label used by an external task integration.
- Chat history is stored as a JSONB workspace snapshot rather than normalized
  message tables.
- Client password change/reset is not implemented.
- General file uploads require private object storage, malware scanning,
  tenant checks, validation, and retention rules.
- The application does not automatically crawl client websites or synchronize
  ChatGPT workspace project files.
- Knowledge approval and vector-store publication are not yet automated.
- Near-real-time AI access uses polling rather than push notifications.
- Rate limiting beyond the monthly client allowance, audit logs, MFA, account
  lockout policy, password recovery, legal/privacy review, and automated
  tenant-isolation tests are still required before a full production launch.
- ChatKit initially supports text and configured file search. Uploads, generated
  images, custom actions, and migration of old folders/branches need a follow-up.

Vercel hosting, Neon, and signed authentication improve the security posture,
but no platform makes an application automatically secure. Protect Vercel,
Neon, GitHub, and OpenAI accounts with MFA and least-privilege access, rotate
secrets, keep dependencies updated, and review logs before onboarding real
clients.
