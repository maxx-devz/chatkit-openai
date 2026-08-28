# AOC-GPT Client Portal Prototype

A Vercel-ready Next.js chat portal powered by the OpenAI Responses API. The
project uses JavaScript only: there is no Python service or separate server to
deploy.

## What is included

- A responsive AOC-branded chat interface.
- Streaming responses from the OpenAI API.
- A model picker populated from models reported by the server's API key.
- Conversational image generation when the API project has GPT Image access.
- Visible thinking, file-checking, and image-generation progress states with a
  client timeout so requests cannot display a permanent loading indicator.
- Editable server-side assistant instructions.
- Folders for organizing chats.
- Saved chat history in Neon when connected, with a browser-only demo fallback.
- Conversation branching from completed assistant responses.
- A Next.js API route that keeps the OpenAI API key on the server.
- Per-client assistant instructions and an optional client-specific OpenAI
  vector-store connection.

## Requirements

- Node.js 20.9 or newer. Node.js 22 LTS is recommended.
- npm, which is included with Node.js.
- An OpenAI API key from <https://platform.openai.com/api-keys>.
- A Neon Postgres database for account-backed chat history. The interface still
  runs in browser-demo mode while Neon is not configured.

## First-time local setup

### 1. Open a terminal in this project

```powershell
cd "C:\Users\AOC-DEV 2\chatkit\chatkit-nextjs"
```

If the project is on another computer, change the path to the folder where you
downloaded or cloned it.

### 2. Install the dependencies

```powershell
npm install
```

This installs Next.js, React, the official OpenAI JavaScript SDK, and the other
packages listed in `package.json`.

### 3. Create the local environment file

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

Open `.env.local` and replace the placeholder with a fresh API key:

```dotenv
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-5.4-mini
DATABASE_URL=
PORTAL_CLIENT_SLUG=churchbanners
PORTAL_CLIENT_NAME=ChurchBanners
PORTAL_USER_ID=prototype-user
```

Do not add quotes or spaces around the values. Never commit `.env.local`.
See the [official OpenAI quickstart](https://developers.openai.com/api/docs/quickstart)
for the SDK and environment-variable setup.

### 4. Start the development server

```powershell
npm run dev
```

Open <http://127.0.0.1:3000> in a browser. Press `Ctrl+C` in the terminal when
you want to stop the server.

## Connect Neon chat history step by step

The portal works before this setup, but the memory indicator says **Browser
demo**. Complete these steps to make it say **Account memory** and synchronize
history through Neon.

### 1. Copy the Neon connection string

1. Open the Neon project shown in your Vercel Storage dashboard.
2. Select **Connect to Project** or **Open in Neon**.
3. Find the connection string named `DATABASE_URL`.
4. Copy the complete value. It normally begins with `postgresql://`.

The password inside this URL is a secret. Do not paste it into chat, source
code, screenshots, or Git.

### 2. Add the connection string locally

Open `.env.local` and set:

```dotenv
DATABASE_URL=postgresql://your-neon-connection-string
PORTAL_CLIENT_SLUG=churchbanners
PORTAL_CLIENT_NAME=ChurchBanners
PORTAL_USER_ID=prototype-user
```

`PORTAL_CLIENT_SLUG` identifies the prototype tenant. `PORTAL_USER_ID`
identifies the prototype portal user inside that tenant. The browser never
chooses these values.

### 3. Install the database schema

1. In Neon, open **SQL Editor**.
2. Open `database/schema.sql` from this project.
3. Copy the entire file into the Neon SQL Editor.
4. Select **Run**.
5. Confirm Neon reports that the tables and indexes were created.

The schema creates:

- `portal_clients` for each client account and its AI configuration.
- `portal_users` and `portal_memberships` for tenant membership.
- `portal_workspace_snapshots` for folders, branches, prompts, AI replies,
  assets, errors, model metadata, and token usage.
- `portal_knowledge_items` for pending and approved client facts or
  corrections.

### 4. Restart Next.js

Environment changes require a restart:

```powershell
# Stop the old server with Ctrl+C, then run:
npm run dev
```

Reload <http://127.0.0.1:3000>. The chat header should show **Account memory**.
Send a test message, wait for the answer to finish, and refresh the page. Both
the client prompt and AI response should return.

### 5. Verify the saved record

In the Neon SQL Editor, run:

```sql
SELECT
  clients.slug,
  users.external_id,
  snapshots.revision,
  snapshots.updated_at
FROM portal_workspace_snapshots AS snapshots
JOIN portal_clients AS clients ON clients.id = snapshots.client_id
JOIN portal_users AS users ON users.id = snapshots.user_id
ORDER BY snapshots.updated_at DESC;
```

You should see a `churchbanners` row. The `revision` number increases whenever
the workspace is saved.

## Give one client its own instructions

Global AOC behavior remains in `config/assistant.js`. Client-specific behavior
is stored separately in Neon. After opening the portal once, run this example
in the Neon SQL Editor:

```sql
UPDATE portal_clients
SET assistant_instructions =
  'Help ChurchBanners with its ecommerce website and approved project records. Use a concise, friendly tone. If project evidence is missing, say that it is not in the connected client knowledge.'
WHERE slug = 'churchbanners';
```

The server appends these approved instructions to the global AOC instructions
for ChurchBanners only. Another client slug receives its own row and does not
receive this text.

## Add reviewed client knowledge

The schema includes a review queue so an AI answer does not automatically
become trusted knowledge. Add a proposed fact as `pending`:

```sql
INSERT INTO portal_knowledge_items (
  client_id,
  title,
  content,
  source_type,
  status
)
SELECT
  id,
  'Primary website',
  'The approved ChurchBanners website is https://www.churchbanners.com/.',
  'website',
  'pending'
FROM portal_clients
WHERE slug = 'churchbanners';
```

After an AOC administrator verifies it, approve it:

```sql
UPDATE portal_knowledge_items
SET status = 'approved', approved_at = NOW(), updated_at = NOW()
WHERE id = YOUR_KNOWLEDGE_ITEM_ID
  AND client_id = (
    SELECT id FROM portal_clients WHERE slug = 'churchbanners'
  );
```

The UI displays the approved count. For searchable files, create a separate
OpenAI vector store for the client, upload only approved files, and save its ID:

```sql
UPDATE portal_clients
SET openai_vector_store_id = 'vs_your_client_vector_store_id'
WHERE slug = 'churchbanners';
```

Once set, the existing chat route makes that vector store available through
OpenAI File Search for this client. File upload, approval, and vector-store
creation are deliberately not automated in this prototype yet; those need an
authenticated AOC administrator screen, private object storage, validation,
malware scanning, and retention controls.

Official references:

- [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI File Search](https://developers.openai.com/api/docs/guides/tools-file-search)
- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)
- [Postgres on Vercel](https://vercel.com/docs/postgres)

## Available commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install or update local dependencies. |
| `npm run dev` | Start the local development server at `127.0.0.1:3000`. |
| `npm run lint` | Check the source code for lint errors. |
| `npm run build` | Create and verify a Vercel-ready production build. |
| `npm start` | Run the completed production build locally. |

To test a production build locally:

```powershell
npm run build
npm start
```

## Customize the portal

- Edit `config/portal.js` to change the prototype client name, dashboard values,
  projects, quick questions, and AI Assistant panel size.
- Edit `config/assistant.js` to change the assistant's role, tone, response
  style, rules, and boundaries. These instructions are used only on the server.
- Edit `config/site.js` to change the portal name, company information, and
  starter questions.
- Edit `app/globals.css` to change the visual design.
- Replace `aoc-logo.png` and `aoc-icon.png` to update the branding while keeping
  the same filenames.

Restart `npm run dev` after changing environment variables. Most source and CSS
changes update automatically while the development server is running.

## Models, API access, and image generation

The model dropdown calls `app/api/models/route.js`, which uses the OpenAI Models
API with the server-side key. There is no manually maintained list of exact text
model IDs: the route discovers them at runtime, removes specialized audio, image,
embedding, and similar models with a generic filter, and orders the remaining
models using the API's `created` value. `OPENAI_MODEL` remains the preferred
default and is not rewritten when somebody changes the dropdown. The selected
ID is also validated on the server before every chat request.

This list describes model availability for the **API key**. It does not read a
ChatGPT Free, Plus, or workspace subscription, and it cannot guarantee that the
API project has billing credit remaining. OpenAI API usage is a separate billed
service. The current OpenAI model documentation marks the API Free tier as not
supported for GPT-5.4 Mini and GPT Image.

When GPT Image access is reported for the API project, an image request shows
named progress states and renders the completed image with a download link. To
keep this Vercel prototype simple and prevent browser-storage failures, the
binary image preview is kept only in the current page session. Chat text and
safe image metadata are saved locally, but after reloading the page the image
must be generated again. Production should upload generated files to private
tenant-scoped object storage and persist only an asset ID.

Requests to show the official AOC logo are handled differently: the assistant
returns the approved local `aoc-logo.png` asset without calling an image model or
using API quota. Requests for a new or redesigned image still use GPT Image.
When an OpenAI request fails, expand **Technical details** in the failed message
to see its exact OpenAI error code, HTTP status, request stage, selected models,
and request ID. The API key and raw provider message are never exposed there.

File uploads are intentionally not enabled yet. Pasting or dropping a file
shows an explicit message instead of silently ignoring it. Add authenticated
object storage, file-type and size validation, malware scanning, retention
rules, and tenant authorization before enabling client attachments.

Official references:

- [List models API](https://developers.openai.com/api/reference/typescript/resources/models/methods/list)
- [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)

## Reusable AI Assistant component

The complete assistant workspace is wrapped by:

```text
components/ai-assistant/ai-assistant-panel.js
```

It keeps the existing chat, API streaming, folders, saved history, and branching
behavior together. The client portal places that component inside its AI
Assistant dashboard card.

The default component size is controlled in `config/portal.js`:

```js
assistantPanel: {
  height: "680px",
  minHeight: "540px",
},
```

Use a fixed height such as `"680px"`, or make it follow the browser height:

```js
assistantPanel: {
  height: "calc(100dvh - 220px)",
  minHeight: "540px",
},
```

To place the assistant in another portal page or card:

```jsx
import AiAssistantPanel from "@/components/ai-assistant/ai-assistant-panel";
import { SITE_CONFIG } from "@/config/site";

<AiAssistantPanel
  config={SITE_CONFIG}
  height="680px"
  minHeight="540px"
/>
```

Portal presentation files are organized under `components/portal`. The OpenAI
server route remains in `app/api/chat/route.js`.

## Create a private Git backup

If this folder is not already a Git repository, create a new private repository
backup with:

```powershell
git init
git add .
git status
git commit -m "Initial AOC-GPT portal prototype"
git branch -M main
git remote add origin YOUR_PRIVATE_REPOSITORY_URL
git push -u origin main
```

Before committing, confirm that `git status` does **not** show `.env.local`,
`node_modules`, or `.next`. The included `.gitignore` excludes:

- API keys and local `.env` files, except the safe `.env.example` template.
- Installed dependencies in `node_modules`.
- Next.js output in `.next`, `out`, and `build`.
- Vercel local state, logs, test coverage, editor settings, caches, and common
  temporary files.

Keep the repository private because this is an internal prototype, even though
the API key is excluded.

## Deploy to Vercel

1. Push the project to a private Git repository.
2. In Vercel, select **Add New Project** and import the repository.
3. Let Vercel detect the Next.js framework settings.
4. Add `OPENAI_API_KEY` and `OPENAI_MODEL` under **Project Settings ->
   Environment Variables**.
5. Deploy the project.

Do not upload `.env.local` to Vercel. Production secrets belong in Vercel's
Environment Variables settings.

For prototype testing, enable Vercel Deployment Protection. The current API
routes use the fixed server-side `PORTAL_CLIENT_SLUG` and `PORTAL_USER_ID`; they
do not authenticate users. Do not open the app to clients or the public until
portal authentication, membership-based authorization, rate limiting, and
client data-isolation tests are implemented.

## How chat history works

When `DATABASE_URL` is configured and the schema is installed, folders and
conversations are stored as a tenant-and-user-scoped JSONB workspace in Neon.
Both user prompts and AI responses are included. The UI debounces saves to
avoid writing once for every streamed text fragment.

Without `DATABASE_URL`, the prototype falls back to browser `localStorage`:

- They remain after refreshing on the same browser profile.
- They do not synchronize between users, browsers, or devices.
- Clearing browser site data deletes them.
- Anyone using the same browser profile can access them.
- Browser folders are organizational labels, not security boundaries.

Before real client use, move chat history to an authenticated server-side
database and enforce the client's organization ID on every read and write.

## Current AOC-GPT limitation

This prototype is not connected to ChatGPT Projects, the AOC-GPT workspace, or
client knowledge folders. A ChatGPT workspace subscription and the OpenAI API
are separate systems. Client-specific knowledge requires a separate secure
ingestion and retrieval layer.

This project currently uses a custom React chat interface and the OpenAI
Responses API. It does not use the `@openai/chatkit-react` package or the
ChatKit server protocol.
