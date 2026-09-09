# AOC-GPT Client Portal

The client portal uses OpenAI ChatKit for conversations and interactive file cards.
A Python ChatKit server runs the assistant through the Agents SDK and Responses API.
Next.js handles the portal, Better Auth login, administrator tools, and authenticated
requests. Neon stores client settings, conversations, usage, and generated files.

**Start here: [Local setup and Vercel deployment](docs/CHATKIT_SETUP.md).**
**Configure replies: [Assistant settings](docs/BUILDER_SETUP.md).**
**Transfer your custom GPT: [AOC-GPT configuration](docs/AOC_GPT_SETUP.md).**

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

## Included

- Private client login and server-verified client membership.
- ChatKit streaming, saved threads, rename, delete, retry, and download cards.
- Earlier conversations preserved in a read-only **Earlier chats** archive.
- AOC-GPT branding and approved per-client instructions and knowledge.
- Optional client-specific OpenAI vector-store file search.
- Optional DOCX and image tools, enabled by staff per client.
- Client/user ownership checks for all conversations and file downloads.
- Monthly chat allowance, separate generation attempt limits, and usage tracking.
- Staff-only settings at `/builder`: drafts, tests, publishing, versions,
  greeting, colors, and starter prompts.
- Existing administrator dashboard and staff assistant at `/admin`.
- Optional Hubstaff project, task, and time reads for the client dashboard.

ChatKit is the client assistant interface. The old client chat UI, its model/chat
endpoints, obsolete CSS, and unfinished workflow integration have been removed.
Existing accounts, client records, conversations, and administrator tools are retained.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js and local Python |
| `npm run dev:web` | Start Next.js when Python is already running |
| `npm run setup:check` | Check local configuration and database tables without displaying secrets |
| `npm run lint` | Check JavaScript/React |
| `npm test` | Run JavaScript security/configuration tests |
| `npm run test:http` | Check local routes while both dev services are running |
| `npm run build` | Build the Next.js production application |
| `npm start` | Serve a production build; configure a running HTTPS Python backend separately |
| `npm run auth:migrate` | Better Auth schema |
| `npm run portal:migrate` | Client, membership, and earlier-history schema |
| `npm run admin:migrate` | Staff access and monthly usage schema |
| `npm run chatkit:migrate` | ChatKit conversations and request leases |
| `npm run builder:migrate` | Assistant configuration, tools, and generated files |
| `npm run admin:create -- USERNAME "DISPLAY NAME"` | Create a staff login; password is prompted privately |
| `npm run client:create -- USERNAME "DISPLAY NAME"` | Create a client login |
| `npm run list:client` | List current client accounts |
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
| `chatkit_backend/generation.py` | DOCX and image generation with private storage |
| `chatkit_backend/generated-file.widget` | ChatKit download-card template |
| `components/builder/assistant-builder.js` | Staff settings and draft tests |
| `lib/builder-repository.js` | Transactional publishing and version history |
| `app/api/assistant-files/[id]/route.js` | Authorized file downloads |
| `config/assistant.js` | Company-wide server instructions |
| `lib/portal-data.js` | Client access, earlier history, and allowance display |
| `config/portal.js` | Dashboard content and assistant panel sizing |

## Current boundaries

Tools create structured Word documents and square WebP images. Uploads, arbitrary
file formats, Google Drive delivery, third-party actions, and per-output approval
queues are not implemented. Staff approve instructions/tools before publishing;
generated files can then be downloaded immediately by their requesting user.
See [tool limits](docs/BUILDER_SETUP.md#generation-and-storage-limits).

The private settings page is this application's editor. OpenAI's Widget Builder
can design cards; it is not a workflow automation engine. Instructions alone
cannot add new tools or connect external applications.

The dashboard still contains sample content where Hubstaff is not configured.
Password recovery and automatic knowledge synchronization are not implemented.
OpenAI API billing is separate from ChatGPT Business.
