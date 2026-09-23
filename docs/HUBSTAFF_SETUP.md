# Hubstaff dashboard and assistant setup

The client dashboard refreshes Hubstaff time and budget data every 30 seconds.
Workflow column metadata loads in a separate request, and the tasks inside a
column load only when the client expands that column. This keeps the initial
dashboard fast even when a project has hundreds of completed tasks. AOC-GPT
receives a fresh read-only snapshot when it answers a Hubstaff question. Each
authenticated client can access only the Hubstaff project saved on that client's
portal record.

## What is dynamic

- Hours used from the first day of the current month through today.
- Hours remaining from Hubstaff's current project budget period, or the client's
  optional monthly portal limit. The UI labels weekly, monthly, and fixed budget
  periods separately.
- Hubstaff project name, status, and clickable project link.
- Exact Hubstaff Tasks column names, displayed in their Hubstaff order. Common
  names are visually grouped as Up Next, In Progress, Review, and Done while
  client-specific names remain unchanged.
- Tasks loaded on demand from the selected column, with a direct **Open task**
  link. Done columns show only work completed during the current month.
- Active workflow task totals and tasks completed during the current month.
- AOC-GPT answers to questions such as "What work was completed today?"

Hubstaff activity totals may be delayed by up to 20 minutes. An expanded workflow
column reads up to 100 task rows, and the time report reads up to 100 daily
activity rows per refresh. The portal displays a warning when a result is
truncated. The assistant snapshot contains at most 40 recent tasks.

## 1. Create the Hubstaff token

An organization token is not required. A Hubstaff member can connect the portal
with a personal access token (PAT), and the API returns only organizations and
projects that member is permitted to read. Create the PAT with `hubstaff:read`
and `tasks:read` scopes using Hubstaff's
[authentication guide](https://developer.hubstaff.com/authentication/).

The value Hubstaff initially shows for a PAT is a refresh token. It is not a
Bearer access token. The portal exchanges it for a roughly 24-hour access token,
saves Hubstaff's rotated refresh token in Neon using AES-256-GCM encryption, and
refreshes it automatically. A database transaction lock prevents two Vercel
instances from rotating the same token at the same time.

Generate a separate stable encryption key:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Configure the Quantum Next.js project:

```dotenv
HUBSTAFF_ACCESS_TOKEN=
HUBSTAFF_PAT_REFRESH_TOKEN=paste_the_initial_pat_value_here
HUBSTAFF_TOKEN_ENCRYPTION_KEY=paste_the_generated_random_value_here
HUBSTAFF_REPORT_TIME_ZONE=Asia/Manila
```

If an owner later supplies an organization token beginning with `hsoat_`, it
can instead go in `HUBSTAFF_ACCESS_TOKEN`; the two PAT variables can then be
left blank. A manually exchanged short-lived PAT access token also works in
`HUBSTAFF_ACCESS_TOKEN`, but it expires and will not refresh automatically.

Put these values in `.env.local` for local development and in the existing
Quantum Next.js Vercel project's environment variables for Production and any
Preview environment you use. All deployments that share the same Neon database
must use the same `HUBSTAFF_TOKEN_ENCRYPTION_KEY`. Do not change that key after
the first exchange. Do not add any Hubstaff variable to the ChatKit Python
project or prefix it with `NEXT_PUBLIC_`.

The Vercel server cannot reuse the Hubstaff cookie from a member's browser: the
cookie belongs to Hubstaff's domain and is not available to this application.
The PAT supplies equivalent server-side access within that member's permissions.

`HUBSTAFF_REPORT_TIME_ZONE` must be an IANA timezone and should match the
Hubstaff organization timezone. `UTC` is used when it is blank or invalid.

## 2. Update the database

Run this once against the same Neon database used by the portal, before the
first PAT exchange:

```powershell
npm run admin:migrate
```

The migration adds the optional per-client monthly hours limit and the encrypted
singleton token store. It preserves existing clients and data. Vercel builds do
not run migrations automatically.

## 3. Connect each client

Sign in as an administrator and open **Admin -> Client controls**. For each
client:

1. Paste its full Hubstaff project URL, for example
   `https://tasks.hubstaff.com/app/organizations/14952/projects/346902`.
2. If Hubstaff already has a monthly hours budget, leave **Monthly Hubstaff hours
   limit** blank.
3. If Hubstaff has no monthly hours budget, enter that client's contracted
   monthly hours as the portal fallback.
4. Save the client.

The hours-limit priority is: Hubstaff's current hours budget history,
Hubstaff's monthly hours budget, client-specific Admin value, then unavailable.
For cost budgets, the portal derives remaining time only when Hubstaff exposes
a single consistent delivery-member rate; otherwise it displays the monetary
balance. There is no global hours fallback because limits belong to clients.

## 4. Test locally

Check the token and Golf Brands project without printing the token or task names:

```powershell
npm run hubstaff:check -- https://tasks.hubstaff.com/app/organizations/14952/projects/346902
npm run setup:check
npm run dev
```

Sign in as the mapped client. Verify the dashboard project name, hours, remaining
limit, and three task columns. Then ask AOC-GPT:

- What work was completed today?
- How many hours remain this month?
- Which tasks are in progress?

The assistant calls a read-only tool. It cannot edit Hubstaff tasks or time.

The first `hubstaff:check` exchanges the initial PAT and saves Hubstaff's new
rotated refresh token. After that exchange, the original value in the Vercel
environment is only a bootstrap fallback and may already be invalid. If the
encrypted database row is deleted, create a new PAT rather than retrying the old
initial value. Revoking the PAT or removing the member's project access also
removes the portal's access.

## 5. Deploy to Vercel

1. Add `HUBSTAFF_PAT_REFRESH_TOKEN`, `HUBSTAFF_TOKEN_ENCRYPTION_KEY`, and
   `HUBSTAFF_REPORT_TIME_ZONE` to the Quantum Next.js Vercel project. Leave
   `HUBSTAFF_ACCESS_TOKEN` blank for the member PAT setup.
2. Run `npm run admin:migrate` against the production Neon database.
3. Deploy the Python ChatKit backend because it contains the new Hubstaff tool.
4. Deploy the Quantum frontend because it contains the Hubstaff API proxy and UI.
5. Sign in at `https://quantum-project-xi.vercel.app/` as the mapped client and
   repeat the dashboard and AOC-GPT tests above.

No Hubstaff credential belongs in browser code, ChatKit settings, the Python
backend, GitHub, or `answer.txt`.
