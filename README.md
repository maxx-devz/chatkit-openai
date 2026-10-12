# AOC-GPT Client Portal

The client portal uses OpenAI ChatKit for conversations and interactive file cards.
A Python ChatKit server runs the assistant through the Agents SDK and a compatible
Responses API. Chat replies can use OpenAI or OpenRouter without changing the UI.
Next.js handles the portal, Better Auth login, administrator tools, and authenticated
requests. PostgreSQL (currently hosted by Neon) stores client settings,
conversations, usage, and generated files.

**Start here: [Local setup and Vercel deployment](docs/CHATKIT_SETUP.md).**
**Configure replies: [Assistant settings](docs/BUILDER_SETUP.md).**
**Transfer your custom GPT: [AOC-GPT configuration](docs/AOC_GPT_SETUP.md).**
**Monitor usage: [Portal usage and allowances](docs/PORTAL_USAGE.md).**
**Connect client work: [Hubstaff dashboard and assistant](docs/HUBSTAFF_SETUP.md).**
**Restrict public web research: [Approved client websites](docs/WEBSITE_ACCESS_SETUP.md).**
**Save cross-conversation files: [Persistent client library](docs/CLIENT_LIBRARY_SETUP.md).**
**Keep the database portable: [PostgreSQL and possible Supabase migration](docs/DATABASE_PORTABILITY.md).**
**Employee work dashboard: [Employee prototype setup and security](docs/EMPLOYEE_PORTAL.md).**

The portal's AOC-GPT is an API assistant. Your team's existing custom GPT inside
ChatGPT Business does not automatically connect or synchronize with it. Transfer
approved instructions and knowledge, then test its behavior before publishing.

## Start locally

Use Node.js 22 and Python 3.13. Keep your existing `.env.local`.

```powershell
npm ci
# Only create this environment if .venv does not already exist:
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -r chatkit_backend/requirements.txt
npm run setup:check
npm run dev
```

Open <http://127.0.0.1:3000>. The dev command starts Next.js and the local Python
service together. Ctrl+C stops both. After editing Python code, restart the dev
command. The setup guide covers credentials and migrations for a fresh checkout.

## OpenAI or OpenRouter

Use **AOC Admin → AI provider settings** to choose a provider, enter its key,
load the live model catalog, then save and activate it across admin/client chat.
Both providers retain separate encrypted keys and model selections. Saved keys
are masked and never returned to the browser. Models without tool support are
disabled; OpenRouter free and paid choices are labeled.

Run `npm run site-ai:migrate` and set the same stable `PROVIDER_SETTINGS_SECRET`
on both services. Keep `DATABASE_URL` in deployment configuration: it is required
before admin login. See [provider setup and migration](docs/SITE_AI_MODEL.md).
Old key/model environment variables remain compatibility fallbacks only.

A saved genuine OpenAI key is required for OpenAI images and library indexing,
even when chat uses OpenRouter. Hosted OpenAI vector-store search is not attached
to OpenRouter chat requests; switch chat back to OpenAI when that tool is required.

## Included

- Private client login and server-verified client membership.
- ChatKit streaming, saved threads, rename, delete, retry, and download cards.
- Earlier conversations preserved in a read-only **Earlier chats** archive.
- AOC-GPT branding and approved per-client instructions and knowledge.
- Optional client-specific OpenAI vector-store file search.
- Persistent client files and reference links with a private **Library** tab.
- Optional DOCX and image tools, enabled by staff per client.
- Client/user ownership checks for all conversations and file downloads.
- Monthly chat allowance, separate generation attempt limits, and usage tracking.
- Staff-only settings at `/builder`: drafts, tests, publishing, versions,
  greeting, colors, and starter prompts.
- Existing administrator dashboard and staff assistant at `/admin`.
- Administrator Employee Controls for provisioning employee-only accounts,
  assigning positions, enabling portal panels, and pausing access.
- One Employee Portal with separate My Work, Team Workspace, and Settings
  containers, each protected by the employee panel policy.
- Staff usage panel with client allowances and recorded client/admin/draft tokens.
- Per-client Hubstaff project, task, and monthly time reads for the dashboard
  and read-only AOC-GPT answers.
- Optional per-client public website search, locked by the server to the domain
  approved by an administrator.

ChatKit is the client assistant interface. The old client chat UI, its model/chat
endpoints, obsolete CSS, and unfinished workflow integration have been removed.
Existing accounts, client records, conversations, and administrator tools are retained.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js and local Python |
| `npm run dev:web` | Start Next.js when Python is already running |
| `npm run setup:check` | Check local configuration and database tables without displaying secrets |
| `npm run setup:check -- --employee` | Also check the optional employee schema and encryption key |
| `npm run employee:migrate` | Add/update employee access, position, panel policy, and encrypted connection storage |
| `npm run employee:create -- USERNAME "DISPLAY NAME" APPROVED_HUBSTAFF_USER_ID` | Privately provision employee-only access; password is prompted |
| `npm run test:employee` | Employee authorization, Hubstaff isolation, credential safety, and real Better Auth login tests |
| `npm run test:employee:database` | Employee SQL checks in rolled-back temporary tables |
| `npm run test:employee:ui` | Isolated desktop/mobile browser checks; requires installed Chrome |
| `npm run lint` | Check JavaScript/React |
| `npm test` | Run JavaScript security/configuration tests |
| `npm run test:http` | Check local routes while both dev services are running |
| `npm run build` | Build the Next.js production application |
| `npm start` | Serve a production build; configure a running HTTPS Python backend separately |
| `npm run auth:migrate` | Better Auth schema |
| `npm run portal:migrate` | Client, membership, and earlier-history schema |
| `npm run admin:migrate` | Staff access, monthly usage, client integrations, and encrypted PAT storage |
| `npm run chatkit:migrate` | ChatKit conversations and request leases |
| `npm run uploads:migrate` | Conversation attachment storage and limits |
| `npm run library:migrate` | Persistent client files, links, reporting dates, and search status |
| `npm run builder:migrate` | Assistant configuration, tools, and generated files |
| `npm run usage:migrate` | Anonymous AI activity totals, independent of allowance resets |
| `npm run admin:create -- USERNAME "DISPLAY NAME"` | Create a staff login; password is prompted privately |
| `npm run client:create -- USERNAME "DISPLAY NAME"` | Create a client login |
| `npm run list:client` | List current client accounts |
| `npm run hubstaff:check -- PROJECT_URL` | Safely verify Hubstaff project access and summary data |
| `npm run client:delete -- USERNAME --confirm-delete` | Permanently remove the specified client |

Create clients through **Add client** in `/admin` or the command above. Existing
users do not need to be recreated. Migration commands use `.env.local`; they do
not run automatically during Vercel builds.

## Deployment

Keep your existing Next.js project and <https://quantum-project-xi.vercel.app/>.
Add a separate Vercel FastAPI project from the same repository with Root Directory
`chatkit_backend`. Configure and test Python first, then redeploy Next.js with
its backend URL and matching secret. The exact order and environment table are in
[the deployment guide](docs/CHATKIT_SETUP.md#5-deploy-on-your-existing-vercel-url).

Because GitHub pushes can trigger your live deployment, prepare the backend,
migrations, and environment variables using a preview branch before merging to
your production branch. Do not commit `.env.local`, credentials, or `answer.txt`.

## Main files

| Path | Purpose |
| --- | --- |
| `components/ai-assistant/chatkit-assistant.js` | ChatKit UI, download actions, and earlier-history archive |
| `app/api/chatkit/route.js` | Authenticated, signed streaming proxy |
| `chatkit_backend/app.py` | Identity checks, quotas, and ChatKit protocol |
| `chatkit_backend/assistant.py` | Agent instructions, file search, and streaming |
| `lib/client-website.js` | Validation and normalization for approved client websites |
| `chatkit_backend/client_library.py` | Permanent client files, links, indexing, and retrieval tools |
| `chatkit_backend/generation.py` | DOCX and image generation with private storage |
| `chatkit_backend/generated-file.widget` | ChatKit download-card template |
| `components/builder/assistant-builder.js` | Staff settings and draft tests |
| `lib/builder-repository.js` | Transactional publishing and version history |
| `app/api/assistant-files/[id]/route.js` | Authorized file downloads |
| `config/assistant.js` | Company-wide server instructions |
| `lib/portal-data.js` | Client access, earlier history, and allowance display |
| `config/portal.js` | Portal layout and assistant panel sizing |

## Current boundaries

Tools create structured Word documents and square WebP images. Clients can attach
supported documents, spreadsheets, text/data files, and images; see the
[upload setup and usage guide](docs/UPLOADS_SETUP.md). Clients can explicitly
promote an attachment into the [persistent client library](docs/CLIENT_LIBRARY_SETUP.md)
for later conversations. Arbitrary file formats, live Google Drive content access,
login-only website access, third-party write actions, and per-output approval
queues are not implemented. Staff approve instructions/tools before publishing;
generated files can then be downloaded immediately by their requesting user.
See [tool limits](docs/BUILDER_SETUP.md#generation-and-storage-limits).

The private settings page is this application's editor. OpenAI's Widget Builder
can design cards; it is not a workflow automation engine. Instructions alone
cannot add new tools or connect external applications.

Accounts without a Hubstaff project show an unconfigured state instead of sample
hours or tasks. Password recovery and automatic knowledge synchronization are not implemented.
API-provider billing is separate from ChatGPT Business.
