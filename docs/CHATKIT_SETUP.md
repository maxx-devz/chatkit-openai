# ChatKit setup for the AOC client portal

Verified on September 9, 2026. The client UI uses `@openai/chatkit-react` **1.6.1**
(ChatKit types **1.9.0**) and `openai-chatkit` **1.6.5**. These were the current
published package releases checked during implementation; npm returned no
deprecation notice for the two JavaScript packages. Versions are pinned for repeatable installs.
The browser runtime is loaded from OpenAI's maintained ChatKit CDN.

For this local checkout, dependencies and the ChatKit database migration have
already been run. Missing ChatKit settings were appended to `.env.local`,
including a randomly generated local backend secret. The public domain key is
still blank and must be supplied from your OpenAI account. No GitHub push or
Vercel deployment has been performed.

OpenAI says ChatKit remains available. **Agent Builder is being deprecated and
is scheduled to shut down November 30, 2026.** This implementation follows the
recommended custom-server path. No vendor can guarantee a product will never
be removed. [Official ChatKit guidance](https://developers.openai.com/api/docs/guides/chatkit).

## What is installed

- The client assistant panel embeds the real ChatKit UI: streaming replies,
  history, new conversations, rename, delete, and retry.
- Better Auth still handles login. Next.js verifies the current client, then
  signs each request to the Python backend. The browser cannot select another
  account by supplying a client ID or access Python directly without that signature.
- Python rechecks membership and AI access, stores conversations in Neon, and
  enforces the existing client-wide monthly allowance. Admin screens are unchanged.
- Global instructions come from `config/assistant.js`. Approved client instructions
  and the client's vector store still come from the existing database fields.
- Earlier conversations remain in the old tables and are readable under
  **Earlier chats**. They are not converted to ChatKit threads or deleted.

The architecture is:

```text
Client browser / ChatKit
  -> existing Next.js website: /api/chatkit (login + origin + current account checks)
  -> signed HTTPS request to Python /chatkit
  -> Neon (scoped history, membership, monthly allowance)
  -> Agents SDK / Responses API (reply + optional file search)
```

The two services can run on Vercel. This repository prepares a separate FastAPI
project for Python so the existing Next.js site's URL and framework configuration
can stay in place. Vercel supports FastAPI and streaming Python responses.
[Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python).

## 1. Check the local runtimes

Stop the old development command with **Ctrl+C** first.

Open PowerShell in the repository:

```powershell
cd "C:\Users\AOC-DEV 2\chatkit\chatkit-nextjs"
node --version
py -3.13 --version
```

Use **Node.js 22 or newer** and **Python 3.13**. Your machine was running Node
20.18.1 when this change was made; update Node and reopen the terminal. Python
3.13 was already available through `py -3.13`.

## 2. Install dependencies

```powershell
npm install
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r chatkit_backend/requirements.txt
```

The project-local `.venv` was created during implementation. On this same
machine you can reuse it; creating it is necessary on a fresh checkout.
No Python activation command is required. On macOS/Linux use `python3.13` to
create `.venv`, and `.venv/bin/python` instead of the Windows executable path.

## 3. Configure `.env.local`

Keep your existing `.env.local`. **Do not overwrite it with `.env.example`.**
The existing `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`,
`BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` remain in use.

Append these settings, also documented in the root `.env.example`:

```dotenv
CLIENT_ASSISTANT_UI=chatkit
NEXT_PUBLIC_CHATKIT_DOMAIN_KEY=
CHATKIT_BACKEND_URL=http://127.0.0.1:8000
CHATKIT_BACKEND_SECRET=
CHATKIT_VERCEL_PROTECTION_BYPASS=
```

| Setting | What to provide |
| --- | --- |
| `NEXT_PUBLIC_CHATKIT_DOMAIN_KEY` | The public domain key from OpenAI's ChatKit domain registration. Register the exact frontend domains/origins used by your app. This is not a secret API key. |
| `CHATKIT_BACKEND_URL` | Local origin above; later the HTTPS origin of the Python Vercel project, with no `/chatkit` suffix. |
| `CHATKIT_BACKEND_SECRET` | A random secret of at least 32 characters, identical on both services. When blank locally, `npm run dev` creates a temporary secret and passes it to both processes. |
| `CHATKIT_VERCEL_PROTECTION_BYPASS` | Optional automation bypass token if the Python Vercel deployment is protected. Only the Next.js server needs it. |

In the OpenAI API Platform, find the ChatKit/domain registration settings for
your organization/project. Register **127.0.0.1** for the local origin
`http://127.0.0.1:3000` and your production frontend
`https://quantum-project-xi.vercel.app`. Also register any custom or preview
frontend domain you intend to test. Follow the settings screen's requested
hostname/origin format. Copy the resulting public key into
`NEXT_PUBLIC_CHATKIT_DOMAIN_KEY`. If you cannot find this setting, describe what
you see in question 7 of `answer.txt`; account availability and dashboard labels
cannot be verified without your account. The installed SDK requires `api.domainKey`.

You do **not** need an Agent Builder workflow ID or a manually copied ChatKit
session token. Your existing OpenAI API key supplies model access on Python.
Do not put `OPENAI_API_KEY`, `DATABASE_URL`, or the shared backend secret in a
`NEXT_PUBLIC_*` variable or `answer.txt`.

For production, generate a separate shared secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into the environment settings for both services. A public
domain key is different from this secret. I cannot issue an OpenAI domain key
or account API key for you.

## 4. Add the database tables

Check that `.env.local` points to the intended Neon database. Prefer a Neon
development branch for local testing.

```powershell
npm run chatkit:migrate
```

This adds three tables: `portal_chatkit_threads`, `portal_chatkit_items`, and
`portal_chatkit_leases`, plus indexes. It preserves earlier chat snapshots and
does not change existing client accounts. It is safe to rerun. The database
must already have the portal and admin migrations from the main README.

The new history tables reference memberships, so deleting a client or its
membership cascades to the associated ChatKit history. There is no automatic
age-based retention policy yet.

## 5. Start locally

```powershell
npm run dev
```

This starts Next.js on **127.0.0.1:3000** and Python on **127.0.0.1:8000**.
Open http://127.0.0.1:3000 and sign in with a **client** account. An administrator
login still opens the existing admin interface.

Keep this terminal open. **Ctrl+C** stops both processes. Next.js updates web
code automatically; restart the command after Python or environment changes.
`npm run dev:web` starts only Next.js and is useful with an already-running backend.

## 6. Verify before deploying

```powershell
npm run lint
npm run test:chatkit
.\.venv\Scripts\python.exe -m unittest discover -s chatkit_backend/tests -v
npm run build
```

Then check the actual client UI:

1. Send a message and check streaming. Refresh and reopen it from ChatKit history.
2. Rename a thread, start another, and delete a disposable test conversation.
3. Read an earlier conversation in **Earlier chats**.
4. Switch to another test client and verify its history is separate.
5. Use the existing admin controls to pause AI, then confirm the client panel
   locks after its next access refresh (within about 15 seconds).
6. Test a low monthly allowance on a test client. New messages/retries consume
   the allowance; viewing, renaming, and deleting history do not.
7. Check narrow/mobile layouts and browser console errors, especially domain
   registration and blocked CDN requests.

Requests admitted for generation count as attempts, including failed/cancelled
responses, matching the existing reservation approach. Token totals are added
when the upstream SDK supplies usage; an interrupted run can lack final usage.
Requests stop after approximately 95 seconds of streaming. A per-account/user
lease prevents simultaneous mutations and expires automatically after 3 minutes
if a process stops unexpectedly.

## 7. Deploy Python to Vercel

1. Push the reviewed changes to a development GitHub branch when ready. This
   work does not push, merge, or deploy your production site automatically.
2. In Vercel choose **Add New → Project**, import the **same repository**, and
   create a second project, for example `quantum-chatkit-backend`.
3. Set **Root Directory** to `chatkit_backend` and the framework to **FastAPI**.
   Keep the framework's default install/build settings; do not use `npm run build`
   for this Python project. `.python-version` selects Python 3.13.
4. Add the following server environment variables to that project:

   ```dotenv
   OPENAI_API_KEY=<your-existing-OpenAI-project-key>
   OPENAI_MODEL=<the-model-your-project-uses>
   DATABASE_URL=<the-same-Neon-database-used-by-the-frontend>
   CHATKIT_BACKEND_SECRET=<your-generated-production-shared-secret>
   ```

5. Deploy and copy its HTTPS origin. `/health` should return `status: ok` when
   deployment protection permits access. Health confirms the service started;
   it does not verify database migrations or model access.
6. If Vercel Deployment Protection blocks server requests, create its automation
   bypass token and put it in the **Next.js** project's
   `CHATKIT_VERCEL_PROTECTION_BYPASS`. Keep the backend's signature checks enabled.

The backend config requests a 120-second function duration. Verify your project's
plan and duration settings in Vercel. The deployment itself has not been tested
against your Vercel account. [FastAPI on Vercel](https://vercel.com/docs/frameworks/backend/fastapi).

## 8. Configure the existing Next.js Vercel project

1. Keep the existing project's root directory and **Next.js** framework preset.
2. Keep its existing secrets. Set Node.js to **22.x or newer** in project settings.
3. Add/update:

   ```dotenv
   CLIENT_ASSISTANT_UI=chatkit
   NEXT_PUBLIC_CHATKIT_DOMAIN_KEY=<registered-frontend-public-domain-key>
   CHATKIT_BACKEND_URL=https://YOUR-CHATKIT-BACKEND.vercel.app
   CHATKIT_BACKEND_SECRET=<the-same-production-shared-secret>
   BETTER_AUTH_URL=https://quantum-project-xi.vercel.app
   ```

4. Add the optional bypass token from step 7 if needed.
5. Apply the ChatKit migration to the production Neon database before enabling
   the new frontend there. Local migration only prepares the database selected
   in your local `.env.local`.
6. Redeploy the Next.js project. `NEXT_PUBLIC_*` variables are included at build
   time, so changing the public domain key requires a new build.
7. Repeat the client checks on a preview deployment before promoting production.
   Preview needs its own matching `BETTER_AUTH_URL`, registered frontend domain,
   and consistent backend/database environment.

## How to teach the assistant and customize it

ChatKit is the conversation UI. The model, instructions, approved knowledge,
and connected tools determine its answers; changing the UI alone does not train it.

- Edit **`config/assistant.js` → `ASSISTANT_INSTRUCTIONS`** for the global AOC
  role, tone, and rules; restart/redeploy the frontend after changes.
- Existing per-client approved instructions and vector-store settings continue
  to work. The backend selects them from the authenticated client's database row.
- Set **`OPENAI_MODEL` on Python** to control the ChatKit model. A different
  model must be available to your OpenAI project and compatible with Responses.
- Edit **`chatkit_backend/assistant.py`** to add server-side tools later.
- Customize greeting, starter prompts, and appearance in
  **`components/ai-assistant/chatkit-assistant.js`**.
- OpenAI's advanced integration guide links an interactive Widget Builder for
  designing cards/forms/buttons. Those widgets still need code and authorized
  server actions to perform work; the builder does not itself teach the model.
  [Advanced ChatKit integration guide](https://developers.openai.com/api/docs/guides/custom-chatkit).

## Feature differences and decisions for later

| Feature | This integration |
| --- | --- |
| Text replies and saved history | Included; persisted in Neon by client and user |
| Existing instructions / configured file search | Included |
| Monthly limits / AI pause / usage dashboard | Existing tables and controls reused |
| Old conversations | Read-only archive; old image metadata is retained but image previews are not rebuilt |
| Model picker | Server-selected model for ChatKit; old interface keeps its picker |
| Folders / branches / automatic old-history import | Not ported to ChatKit |
| Image generation / uploads / voice / web search | Not enabled in this first ChatKit integration |
| Live Hubstaff queries inside chat | Not connected; the existing portal cards continue to work |
| Custom cards/actions or changing external records | Not enabled |
| Admin UI redesign / browser workflow editor | Deferred as requested |

The reply context is bounded to recent history (up to 40 stored items and about
60,000 serialized characters); earlier messages are still visible in the UI.
SDK tracing is disabled for this implementation. Standard OpenAI API data handling
still applies to model requests.

Fill out **`answer.txt`** and say “read answer.txt” to provide the remaining
preferences. Useful next improvements are approved client FAQs, a read-only
Hubstaff lookup tool, private document uploads, and a clear human handoff path.
Choose which external actions clients should be able to authorize before adding
write-capable tools.

## Troubleshooting and rollback

- **“Assistant is being set up”**: fill in the public domain key, verify backend
  configuration, and restart/rebuild. Backend configuration errors are logged by
  variable name without printing secrets.
- **“Could not connect”**: check both terminal logs, Python `/health`, the shared
  secret on both projects, database migrations, and deployment-protection settings.
- **Chat frame does not load**: check the registered domain and CDN access. The
  client page's CSP explicitly permits ChatKit frames from
  `https://cdn.platform.openai.com` and supplies the nonce to its script.
- **Port already in use**: stop your earlier `npm run dev` terminal before starting
  the new one. Do not stop unrelated Node/Python processes.
- **Windows Python errors**: use the project `.venv` with Python 3.13. The dev
  launcher selects the event loop required by the PostgreSQL driver.
- **Rollback**: set `CLIENT_ASSISTANT_UI=legacy` and restart/redeploy the frontend.
  No database rollback is needed. ChatKit history stays stored separately and
  reappears when ChatKit is enabled again. The old interface retains its own history.
