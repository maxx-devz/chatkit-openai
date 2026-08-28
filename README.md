# AOC-GPT Client Portal

A Vercel-ready client portal for Always Open Commerce. It provides private
client login, a tenant-isolated AOC AI Assistant, saved conversations in Neon
Postgres, and an administrator dashboard for managing clients and monthly AI
allowances.

The application is one JavaScript/Next.js project. It does not require Python
or a separate application server.

## Current status

This working prototype includes:

- private username/password authentication using Better Auth;
- no public account-registration page;
- dynamic client accounts stored in Neon Postgres;
- server-side client membership and administrator authorization checks;
- per-client folders, chat history, conversation branches, replies, generated
  image references, errors, models, and usage metadata;
- streaming OpenAI Responses API output;
- a model selector populated from models available to the configured OpenAI
  API project;
- global AOC instructions, per-client instructions, and optional per-client
  OpenAI vector stores;
- monthly AI request and token-usage tracking;
- an AOC administrator dashboard at `/admin`;
- per-client portal and AI Assistant enable/disable controls;
- a professional locked Assistant state when AI access is paused;
- near-real-time AI access updates on the client portal; and
- a production build compatible with Vercel serverless hosting.

The hours, goals, project cards, and similar business metrics in
`config/portal.js` are still prototype content. Client identity, access,
assistant settings, monthly usage, and saved chat history are database-backed.

## Important implementation note

The chat interface is a custom React interface using the OpenAI Responses API.
It does not currently use `@openai/chatkit-react` or the hosted ChatKit server
protocol. This keeps the prototype as a single Next.js application, but moving
to the ChatKit component later would require a separate integration pass.

## Architecture

```text
Browser
  -> Next.js pages and authenticated API routes on Vercel
     -> Better Auth session tables in Neon
     -> AOC portal, membership, history, and usage tables in Neon
     -> OpenAI Responses API
        -> optional client-specific OpenAI vector store
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

- Node.js 20.9 or newer; Node.js 22 LTS is recommended.
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

Example:

```text
BETTER_AUTH_URL=https://your-project-name.vercel.app
```

Use `DATABASE_URL`, even if a Vercel/Neon integration also created a variable
such as `env_DATABASE_URL`. The application reads `DATABASE_URL`.

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
| `npm run dev` | Start development at `http://127.0.0.1:3000` |
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
| `components/workspace.js` | Folders, threads, persistence, model state, and live AI access refresh |
| `components/chat.js` | Chat UI, streaming events, generated assets, usage, and locked state |
| `components/admin/admin-dashboard.js` | Administrator client-control dashboard |
| `app/api/chat/route.js` | Authenticated OpenAI Responses API route |
| `app/api/models/route.js` | Authenticated available-model catalog |
| `app/api/workspace/route.js` | Authenticated Neon workspace load/save route |
| `app/api/ai-access/route.js` | Authenticated live AI access and monthly usage route |
| `app/api/admin/clients/route.js` | Protected admin client list/create/update route |
| `app/api/admin/usage/route.js` | Protected monthly usage reset route |
| `lib/auth.js` | Better Auth configuration |
| `lib/portal-data.js` | Client membership, tenant data, history, and AI allowance logic |
| `lib/admin-data.js` | Administrator authorization and client controls |
| `config/assistant.js` | Global server-side assistant instructions |
| `config/portal.js` | Prototype portal content and Assistant component sizing |
| `database/schema.sql` | Core client portal schema |
| `database/admin-schema.sql` | Administrator, AI control, and monthly usage schema |
| `scripts/` | Local migrations and account-management commands |

## Current prototype limitations

- Dashboard hours, goals, projects, and status cards are not connected to AOC
  project-management systems.
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
- The interface is custom React and does not currently use OpenAI ChatKit.

Vercel hosting, Neon, and signed authentication improve the security posture,
but no platform makes an application automatically secure. Protect Vercel,
Neon, GitHub, and OpenAI accounts with MFA and least-privilege access, rotate
secrets, keep dependencies updated, and review logs before onboarding real
clients.
