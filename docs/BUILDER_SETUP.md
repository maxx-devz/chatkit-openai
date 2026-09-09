# Private assistant builder on Vercel

The editor is at `/builder` on the existing Next.js website. Sign in with an
active AOC administrator account, then select **Assistant settings** in the admin
sidebar. Client accounts cannot open the editor or call its APIs. This is your
application's own editor; it does not depend on OpenAI Agent Builder.

The editor includes per-client instructions, approved reference text, an existing
OpenAI vector-store connection, DOCX/image tools, greeting/color/starter prompts,
saved drafts, a test conversation, publishing, and the last ten published versions.
The test chat calls the same Python agent factory and tools as client ChatKit.
Tests use saved drafts; live conversations use published settings.

## 1. Run locally

Use Node.js 22 or newer and Python 3.13. After pulling this change:

```powershell
npm install
.venv\Scripts\python.exe -m pip install -r chatkit_backend/requirements.txt
npm run chatkit:migrate
npm run builder:migrate
npm run dev
```

If `.venv` does not exist, first run `py -3.13 -m venv .venv`. On macOS/Linux use
`.venv/bin/python` instead. The migrations are additive and do not publish any
client settings. They use the database named by `.env.local`.

Open `http://127.0.0.1:3000/builder`. If redirected to login, sign in as staff and
open `/builder` again, or use the new admin sidebar link. Existing staff accounts
work. To provision a staff account, use the existing `npm run admin:create` flow.

## 2. Configure the two Vercel projects

Keep the existing frontend project and URL. Keep the Python project with Root
Directory `chatkit_backend`, following [the ChatKit guide](CHATKIT_SETUP.md).
Both projects can deploy from the same GitHub repository.

| Environment variable | Next.js project | Python project |
| --- | --- | --- |
| `DATABASE_URL` | Existing Neon database | Same database |
| `BETTER_AUTH_URL` | Exact frontend origin | Not needed |
| `BETTER_AUTH_SECRET` | Existing auth secret | Not needed |
| `OPENAI_API_KEY` | Existing uses can keep it | Required for tests and client replies |
| `OPENAI_MODEL` | Existing uses can keep it | Text model, default `gpt-5.4-mini` |
| `OPENAI_IMAGE_MODEL` | Optional existing uses | Optional; default `gpt-image-2` |
| `CHATKIT_BACKEND_URL` | Python project's HTTPS origin | Not needed |
| `CHATKIT_BACKEND_SECRET` | Existing shared secret | Same secret |
| `NEXT_PUBLIC_CHATKIT_DOMAIN_KEY` | Existing registered public key | Not needed |
| `CHATKIT_VERCEL_PROTECTION_BYPASS` | If backend deployment protection requires it | Not needed |

There is no additional builder API key or storage account. Only the ChatKit
domain key is public. Model access and API billing must be active on the OpenAI
project. The editor and its plain test conversation do not require loading the
ChatKit browser embed; client ChatKit still requires the registered domain key.

## 3. Deploy

1. Review the changes and run the checks below.
2. Apply `npm run builder:migrate` using the intended deployment's `DATABASE_URL`.
   If local `.env.local` points to another branch/database, running it locally
   does not migrate production. Do not change `DATABASE_URL` to an unrelated DB.
3. Commit and push the reviewed change to your connected GitHub branch. Deploy
   the Python project with the new requirements and `.widget` asset, then the
   Next.js project. Existing clients keep their tools disabled unless published.
4. Open `https://quantum-project-xi.vercel.app/builder` and sign in as staff.
5. Save and test one client's draft. Confirm the right client is selected, then
   click **Publish for [client]**. Publication applies to subsequent replies;
   reload an already-open client page to see new appearance settings.
6. Sign in as that client and request a sample DOCX and image if those tools were
   enabled. Check the Download buttons, persisted history, and monthly limits.

The Python and Next.js routes allow 120 seconds. Generation is bounded inside
that window and errors if it runs too long; it does not start a detached worker
that might be killed after a Vercel response. Confirm your Vercel plan supports
the configured duration. Large/batch document work should use a durable job
service in a later extension.

## 4. Use the editor

1. Select a client.
2. **Instructions:** describe role, tone, allowed work, required questions, and
   behavior when information is missing. Company-wide instructions still apply.
3. **Knowledge:** paste approved reference material, up to 16,000 characters.
   Optionally enter a `vs_...` store containing only that client's approved
   documents. This version does not upload or create vector-store files.
4. **Tools:** enable Word documents and/or images. Set separate monthly attempt
   limits. Both tools start disabled; publishing does not enable them implicitly.
5. **Appearance:** set greeting, accent color, and up to three starter prompts.
6. **Save draft** and test. Test changes do not enter client history or consume
   the client's monthly allowance, but do incur OpenAI API charges. Each staff
   account has 20 test replies per hour. Saving/resetting clears the local test
   transcript so prompts from different drafts/clients do not mix.
7. **Publish** makes the saved configuration live for the selected client.
8. **Versions** can copy a prior published version into the editor. Save, test,
   and publish it to roll back. No version is deployed merely by selecting it.

If another editor changes the draft, stale saves/publications return a conflict.
Existing admin instruction/store changes remain effective immediately and cause
the builder to require a reset to live settings before overwriting them. Copy any
draft material you want to keep before resetting.

Example test: "Create a proposal as a Word document using only our approved
services. Ask me for any missing scope or prices." Another: "Generate a simple
promotional image that follows our approved brand instructions."

## Generation and storage limits

- DOCX output supports a title, up to 20 sections, paragraphs, and bullet lists;
  total section text is limited to 30,000 characters. It is a real Word file,
  generated by `python-docx`, not renamed plain text. Branded template import,
  complex tables, PDFs, spreadsheets, and arbitrary generated code are not included.
- Images are generated as 1024 x 1024 WebP files. Image API usage is billed
  separately; the existing text-token dashboard is not a complete cost report.
- At most two generated files per reply and 3 MB per file. Client-wide monthly
  attempts default to 50 DOCX and 10 images, configurable from 1 to 500. Attempts
  include failed API requests; chat's existing monthly allowance also applies.
- Publishing approves the rules and tools. Outputs are downloadable immediately
  by their requesting user. There is no per-output staff approval queue.
- Bounded file bytes are stored in Neon, with client/user ownership checks on
  every download. This avoids ephemeral Vercel disk and public file URLs. For
  higher volumes, migrate bytes to private object storage and retain these checks.
- Live files are removed when their ChatKit thread, client, or owning user is
  deleted. Preview files are accessible only to the creating staff account,
  expire after 24 hours, and are purged on that staff account's next preview.
  File IDs do not grant access by themselves.

## Widget Builder

`chatkit_backend/generated-file.widget` is the working result-card template.
It uses `WidgetTemplate`, avoiding deprecated direct widget-class construction.
The card sends a `download_file` action containing an artifact ID; the client
opens the authenticated download route. Arbitrary URLs/actions are not accepted.

You can design other cards at <https://widgets.chatkit.studio/>. Integrate and
review their templates/actions in code before deploying. The private editor
configures the implemented tools; it does not execute uploaded widget templates
or arbitrary workflows. Instructions do not create new tool capabilities.

## Checks

```powershell
npm run lint
npm run test:chatkit
npm run test:builder
.venv\Scripts\python.exe -m unittest discover -s chatkit_backend/tests -v
node --env-file=.env.local scripts/check-builder-database.mjs
.venv\Scripts\python.exe scripts/check-chatkit-database.py
npm run build
```

The database check scripts create temporary tables in a rolled-back transaction
and never change application records. Model/provider availability still needs a
real saved-draft test with your OpenAI project.

References: [custom ChatKit](https://developers.openai.com/api/docs/guides/custom-chatkit),
[image generation](https://developers.openai.com/api/docs/guides/tools-image-generation),
[Vercel Python](https://vercel.com/docs/functions/runtimes/python).
