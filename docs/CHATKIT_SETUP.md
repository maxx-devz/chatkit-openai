# ChatKit setup and deployment

Verified September 9, 2026. Installed releases: `@openai/chatkit-react 1.6.1`,
`@openai/chatkit 1.9.0`, and `openai-chatkit 1.6.5`. The React and Python SDK
versions match the current npm/PyPI releases checked during implementation.
The browser loads OpenAI's maintained ChatKit CDN runtime.

ChatKit remains available, and OpenAI recommends a custom server for new work.
Agent Builder is scheduled to shut down November 30, 2026. This project uses
ChatKit's custom-server integration and does not require Agent Builder.
Future availability cannot be guaranteed.
[Official ChatKit guidance](https://developers.openai.com/api/docs/guides/chatkit).

## 1. Prepare local development

Use Node.js **22** and Python **3.13**. This machine's system Node was 20.18.1
during implementation. Update Node to 22 and reopen the terminal before using
the regular commands. An isolated Node 22 test does not update your system.

Stop any existing dev process with Ctrl+C, then:

```powershell
cd "C:\Users\AOC-DEV 2\chatkit\chatkit-nextjs"
node --version
py -3.13 --version
npm ci
```

Only if `.venv` does not exist:

```powershell
py -3.13 -m venv .venv
```

Install the Python dependencies:

```powershell
.venv\Scripts\python.exe -m pip install -r chatkit_backend/requirements.txt
```

On macOS/Linux use `python3.13` and `.venv/bin/python`.

## 2. Configure credentials

Keep the existing `.env.local`; do not overwrite working values with examples.
For a fresh checkout, copy `.env.example` to `.env.local` and fill the values.

| Variable | Local value/purpose |
| --- | --- |
| `DATABASE_URL` | Existing Neon connection string |
| `BETTER_AUTH_SECRET` | Existing login secret, at least 32 characters |
| `BETTER_AUTH_URL` | `http://127.0.0.1:3000` exactly |
| `OPENAI_API_KEY` | Server-only OpenAI API project key |
| `OPENAI_MODEL` | Available text model; default `gpt-5.4-mini` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` when enabling images |
| `NEXT_PUBLIC_CHATKIT_DOMAIN_KEY` | Public ChatKit domain key |
| `CHATKIT_BACKEND_URL` | `http://127.0.0.1:8000` |
| `CHATKIT_BACKEND_SECRET` | Random 32+ character secret shared by both services |
| `CHATKIT_VERCEL_PROTECTION_BYPASS` | Leave blank locally |
| `HUBSTAFF_ACCESS_TOKEN` | Optional existing server-only Hubstaff organization token |
| `HUBSTAFF_MONTHLY_HOURS_DEFAULT` | Optional existing hours fallback |

Create/manage your API key in the [API Platform](https://platform.openai.com/api-keys).
ChatGPT Business and API usage have separate billing. An existing custom GPT's
link, ChatGPT login cookie, or Business subscription cannot replace an API key.

In the API Platform's ChatKit domain registration settings, register your actual
frontend domains, including local `127.0.0.1` and
`quantum-project-xi.vercel.app`. Follow the screen's hostname/origin format and
copy the generated **public domain key**. Register any additional preview/custom
domains before testing there. Restart Next.js after changing the key.

Only the domain key belongs in a `NEXT_PUBLIC_*` variable. All API keys,
database credentials, and backend secrets stay server-side. No Agent Builder
workflow ID or manually copied ChatKit session token is needed.

If the local backend secret is blank, `npm run dev` creates an ephemeral secret
for its two child services. Production must have a persistent shared secret.
Generate a separate production value locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The previous `CLIENT_ASSISTANT_UI` switch is no longer used and can be removed
from local/Vercel settings. The client always uses ChatKit.

## 3. Check database tables

Migrations use the database in `.env.local`. Prefer a development Neon branch
locally. Confirm which database you are targeting before running a migration.

For an existing portal, add the ChatKit/settings tables:

```powershell
npm run chatkit:migrate
npm run builder:migrate
npm run usage:migrate
npm run setup:check
```

For a brand-new database, run `auth:migrate`, `portal:migrate`, and
`admin:migrate` first, in that order. Existing accounts and earlier conversations
are preserved. Vercel builds do not run these migrations automatically.

Create a staff account only if you do not already have one:

```powershell
npm run admin:create -- aocadmin "AOC Administrator"
```

The terminal prompts privately for its password. Clients can be created in
`/admin`. Existing users keep their login and client memberships.

## 4. Run and configure the assistant

```powershell
npm run dev
```

Open <http://127.0.0.1:3000>. Next.js uses port 3000; Python uses port 8000.
Ctrl+C stops both. Restart this command after Python or environment changes.

Sign in as staff, open **Assistant settings** from `/admin`, and select a client:

1. Paste approved AOC-GPT behavior into **Instructions**.
2. Add approved reference text in **Knowledge**, or connect that client's
   existing API vector store using its `vs_...` ID.
3. Enable **Word documents** and/or **Images** in **Tools** and set attempt limits.
4. Set the greeting, accent color, and starter prompts in **Appearance**.
5. **Save draft**, test replies, then **Publish for [client]**.
6. Sign in as that client. Test text, generated-file cards, downloads, history,
   and the monthly allowance. Refresh to load changed appearance settings.

The settings editor is private to active administrators. Its test conversation
uses the same agent factory/tools as ChatKit, with saved drafts instead of live
settings. Tests incur API usage but do not enter client conversation history.
The original staff assistant remains available in the administrator dashboard.

See [AOC-GPT transfer steps](AOC_GPT_SETUP.md) and [settings/tool details](BUILDER_SETUP.md).
The existing custom GPT does not synchronize automatically.

## 5. Deploy on your existing Vercel URL

Your answers identify a **free Hobby plan**. Vercel restricts Hobby to personal,
noncommercial use. This AOC client portal is a business application, so arrange
a plan that permits commercial use (such as Pro) for production. This is separate
from OpenAI API billing. No hosting plan or subscription was changed here.
[Vercel Hobby plan terms](https://vercel.com/docs/plans/hobby).

The existing Next.js project keeps **https://quantum-project-xi.vercel.app/**.
The Python backend is a second Vercel project using the same GitHub repository.
Vercel supports FastAPI, Python 3.13, and streaming responses.
[Vercel Python documentation](https://vercel.com/docs/functions/runtimes/python).

Because your GitHub production branch deploys automatically, prepare this release
on a preview branch first. Replace placeholders below with your actual project
and branch names; do not push an incomplete setup straight to production.

1. Run the checks in section 6. Commit the reviewed files to a preview branch
   and push that branch. Keep credentials and `answer.txt` out of Git.
2. In Vercel, **Add New Project**, import the same repository, and use Root
   Directory **chatkit_backend** with the **FastAPI** preset. Use the branch
   containing these changes for the initial backend deployment. The folder
   contains `app.py`, pinned requirements, `.python-version`, and `vercel.json`.
3. Set the Python environment variables from the table below. Use the same Neon
   database as the target frontend. Apply `chatkit:migrate`, `builder:migrate`,
   and `usage:migrate` to that database
   before connecting the frontend.
4. Deploy Python. Its `/health` endpoint should return
   `{"status":"ok","service":"aoc-chatkit"}`. A health response proves startup;
   a real client reply still needs testing.
5. Copy the Python project's stable HTTPS origin into the existing Next.js
   project's `CHATKIT_BACKEND_URL`, with no `/chatkit` suffix.
6. Configure the remaining Next.js variables. Set Node.js to **22.x**. Register
   the frontend's production and any stable preview domain with ChatKit.
7. Deploy/test the frontend preview with matching preview environment values.
   For an authenticated preview, `BETTER_AUTH_URL` must match that preview's
   exact stable URL; unrelated automatic preview URLs will not share login.
8. Once the backend, migrations, and production environment variables are ready,
   merge/push the reviewed frontend change to the connected production branch.
   Redeploy the backend from that same release if necessary.
9. Confirm both deployments are **Ready**, then test the existing live URL.
   Keep the previous Vercel deployment available for rollback.

| Environment variable | Existing Next.js project | Python project |
| --- | --- | --- |
| `DATABASE_URL` | Existing Neon DB | Same DB |
| `BETTER_AUTH_URL` | `https://quantum-project-xi.vercel.app` | Not needed |
| `BETTER_AUTH_SECRET` | Keep existing production auth secret | Not needed |
| `OPENAI_API_KEY` | Required by the existing admin assistant | Required for client replies and draft tests |
| `OPENAI_MODEL` | Existing admin model | Client text model, default `gpt-5.4-mini` |
| `OPENAI_IMAGE_MODEL` | Not needed for client generation | `gpt-image-2` |
| `NEXT_PUBLIC_CHATKIT_DOMAIN_KEY` | Key registered for this frontend | Not needed |
| `CHATKIT_BACKEND_URL` | Python HTTPS origin | Not needed |
| `CHATKIT_BACKEND_SECRET` | New production shared secret | Identical secret |
| `CHATKIT_VERCEL_PROTECTION_BYPASS` | If backend deployment protection requires it | Not needed |
| `HUBSTAFF_ACCESS_TOKEN` | Keep existing optional token | Not needed |
| `HUBSTAFF_MONTHLY_HOURS_DEFAULT` | Keep existing optional setting | Not needed |

Keep environment scopes consistent: Production values for production, Preview
values for a preview. Environment changes require a new deployment.

If Vercel Deployment Protection blocks server-to-server access, use its automation
bypass token in the **Next.js server-only** variable above. Application HMAC
authentication remains required. Never expose that token in the browser.

Both chat routes allow 120 seconds; Python bounds the reply to 95 seconds and the
Next.js proxy waits up to 110 seconds. Configure a Vercel function duration of at
least 120 seconds with a compatible plan/Fluid compute setting. Large or slow
generation can still time out; long-running jobs need a separate durable queue.

## 6. Verify before release

```powershell
npm run setup:check
npm run lint
npm test
.venv\Scripts\python.exe -m unittest discover -s chatkit_backend/tests -v
node --env-file=.env.local scripts/check-builder-database.mjs
node --env-file=.env.local scripts/check-usage-database.mjs
.venv\Scripts\python.exe scripts/check-chatkit-database.py
npm run build
```

While `npm run dev` is running, run `npm run test:http` in another terminal.
The database test scripts use temporary tables in rolled-back transactions.
They do not modify client records and do not call a paid model.

Check secrets before committing:

```powershell
git status --short
git ls-files .env .env.local .env.production answer.txt
```

The second command should print nothing. Review the diff before committing.

For production configuration checking, supply production variables explicitly:

```powershell
node --env-file=.env.production.local scripts/check-setup.mjs --production
```

This optional file is Git-ignored; populate it securely yourself. The checker
verifies configuration and table presence, not billing, matching remote secrets,
domain registration, or deployment health. Those need a real client test.

## Troubleshooting

- **Grey frame: “This content is blocked”:** the old login-page Content Security
  Policy blocked OpenAI's frame after client-side sign-in. The corrected
  `proxy.js` permits `https://cdn.platform.openai.com` as a frame source on all
  portal pages. Deploy the corrected frontend, then press **Ctrl+Shift+R** to
  replace the old document policy. The ChatKit **Reconnect** button alone cannot
  replace it. If it persists, inspect the live `/login` response's
  `Content-Security-Policy` and confirm `frame-src` includes that exact origin;
  also verify the current domain is registered with ChatKit.
- **Usage figures or API balance:** open `/admin` → **AI usage** and follow
  [the usage guide](PORTAL_USAGE.md). Portal limits and token totals do not show
  your remaining OpenAI credit balance. No Admin API key is needed for the
  current portal-only dashboard.

- **Chat is being set up:** check the domain key, restart/redeploy Next.js, and
  confirm the domain is registered. A nonempty key alone does not prove validity.
- **Assistant cannot connect:** verify Python `/health`, its logs, matching
  backend secrets, the HTTPS origin, and any deployment protection token.
- **"This chat request is not supported" immediately on opening ChatKit:**
  older backend releases rejected the browser's history request for 9,999
  conversations. Deploy the current Python backend, which caps each page at
  100 conversations and preserves pagination. Then refresh the portal. This
  initial history request does not use OpenAI credits or the client allowance.
- **Login fails:** preserve the existing auth secret, use the exact frontend
  origin, and confirm both projects target the intended database.
- **Word/image tool is unavailable:** save and publish that client's enabled
  tool. Instructions alone do not enable it.
- **Reply/image fails:** check API billing and access to the configured models.
  Image generation is separately billed and can exceed the bounded request time.
- **`429 credit_balance_exhausted`:** add API credits in your API Platform billing
  settings, then retry. Your ChatGPT Business subscription does not fund API
  requests. Increasing a client's portal allowance does not resolve this error.
- **Allowance reached:** review monthly chat limits in `/admin` and file-attempt
  limits in Assistant settings. Raising these does not add API billing credit.
- **Port is busy:** stop the existing dev command. Do not kill unrelated processes.
- **Rollback:** roll back the frontend deployment in Vercel. Keep the additive
  tables and existing data. The removed legacy UI has no environment toggle.
