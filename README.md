# AOC-GPT Client Portal Prototype

A Vercel-ready Next.js chat portal powered by the OpenAI Responses API. The
project uses JavaScript only: there is no Python service or separate server to
deploy.

## What is included

- A responsive AOC-branded chat interface.
- Streaming responses from the OpenAI API.
- Editable server-side assistant instructions.
- Folders for organizing chats.
- Saved browser-local chat history.
- Conversation branching from completed assistant responses.
- A Next.js API route that keeps the OpenAI API key on the server.

## Requirements

- Node.js 20.9 or newer. Node.js 22 LTS is recommended.
- npm, which is included with Node.js.
- An OpenAI API key from <https://platform.openai.com/api-keys>.

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

- Edit `config/assistant.js` to change the assistant's role, tone, response
  style, rules, and boundaries. These instructions are used only on the server.
- Edit `config/site.js` to change the portal name, company information, and
  starter questions.
- Edit `app/globals.css` to change the visual design.
- Replace `aoc-logo.png` and `aoc-icon.png` to update the branding while keeping
  the same filenames.

Restart `npm run dev` after changing environment variables. Most source and CSS
changes update automatically while the development server is running.

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
route does not authenticate users, so the app must not be opened to clients or
the public until portal authentication, server-side authorization, rate
limiting, and client data isolation are implemented.

## How chat history works

Folders and conversations are currently stored in the browser with
`localStorage`:

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
