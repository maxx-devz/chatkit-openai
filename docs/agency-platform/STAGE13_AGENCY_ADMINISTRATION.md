# Stage 13 — agency administration, local engineering only

Base **b2d36ce**, `feat/agency-platform`, primary checkout
`C:\Users\MY PC\Desktop\AI\portal`. Stage 13A specialist engagements are excluded.
The user clarified this scope explicitly. No real invitations, customer access,
provider requests, payment, Neon change, external rollout or push is authorized.

## Permission contract

| Actor | Clients and staff | Settings / usage / audit | Restrictions |
| --- | --- | --- | --- |
| Agency Owner | Agency-owned clients; client grants; invite existing accounts; manage staff/admin roles | Permitted support/timezone settings, recorded provider cost summary, scoped usage/audit, ownership transfer | Exactly one accountable active owner; transfer before removal. No platform pricing, keys or global operations |
| Agency Administrator | Agency-owned clients and client grants; invite/manage delivery staff and client users | Agency support settings read-only, recorded requests/tokens and agency audit | Cannot promote/invite another agency administrator, change owner/settings, view provider costs or modify a peer/owner |
| Delivery staff | Explicitly assigned clients only; own staff record and own grants | Scoped support settings, assigned-client usage and audit | No client creation, role/grant management, owner settings or billing visibility |
| Client Administrator / ordinary client user | Existing client permissions remain independent | Existing client UI and permissions | Never an agency administrator merely because of a client role |
| Platform owner/operator | Existing `/platform` permissions only | Platform metadata according to Stage 12 | Platform role alone grants no agency delivery access or impersonation |
| Internal Portal identity | Existing Internal roles/panels only | Independent policy | Active or inactive Internal identity cannot fall back into agency access |

An agency's Stage 12 displayed owner is accountability metadata. Migration 009
does not activate it or create memberships automatically. Operational adoption
requires explicit governance, an active non-Internal agency-admin membership and
matching accountable owner. The local seed command creates **new fictional**
accounts/workspaces and deliberately establishes those records. It does not
promote existing real administrators or open external onboarding.

One accountable Agency Owner is used, with any number of separately assigned
agency administrators. Ownership transfer requires the current owner, a different
active administrator **already in that agency**, a reason, current revision and
typed agency slug. The previous owner retains only agency-admin authority. A
deferred database invariant rejects removing/deactivating/downgrading that final
owner, deleting governance, changing the display owner inconsistently or making
the owner an Internal identity. Client-to-agency ownership moves are unavailable;
the API rejects ownership/agency/billing/provider fields rather than moving data.

## Surfaces and data handling

`/admin/agency` provides explicit agency selection for multi-agency staff. Its
`clients`, `staff`, `settings`, `usage`, `audit` and `sources` child pages reuse the
Admin shell/sidebar, branding, sign-out, dialogs and existing client validation.
Each page displays the active agency. There is no Platform Console navigation.

GET/POST `/api/admin/agency?agency=<slug>` resolves a live Better Auth session,
trusted host, explicit active agency membership, operational governance and
active agency using the existing request-agency check. A slug/header is only a
selector. SQL functions reauthorize actions and target resources; clients and
staff are never selected from a request-supplied agency ownership field. Mutations
require the matching origin, strict allowed fields, reason, revision and operation
UUID. Replayed identical operations are idempotent; stale/changed operations
conflict. Per-agency locks serialize changes before any row writes. Errors contain
no foreign names, counts, credentials or provider details.

Staff require both active legacy client membership and agency client access.
Revoking staff deactivates their grants and legacy memberships **in that agency**
and revokes applicable support grants. Other agencies and the global login remain
intact. Reactivation alone does not restore old client access: reassign explicitly.
Role downgrade takes effect on subsequent requests, including an already signed-in
session. Existing final-client-admin checks apply when editing client grants.

Client creation preserves the existing client tables/identifiers, records agency
ownership atomically and refreshes Stage 04 ownership classification. AI starts
disabled and no user, provider connection or knowledge pack is inherited. Client
edits include portal/AI flags, normalized public website and optional Hubstaff
project mapping. Duplicate project mappings across clients are rejected without
revealing the other client. A configured link is **not proof** of provider resource
permission; live consent/resource checks are still required. No new credential,
OAuth, Make action or global pricing editor is introduced here.

Sources adapt the existing approved-revision metadata rather than exposing source
bodies, private titles/IDs or editing shared packs. Only agency/client-bound
status and connection service mappings are returned. Private administrator packs
and AOC's knowledge/connections are not inherited. Preparation/freshness/connection
metadata is shown honestly; it is not a live provider health check. Publication
approval/editing remains a Stage 20B dependency, and new agency OAuth onboarding
remains behind the external gate. Existing AOC source/admin workflows are preserved.

Usage aggregates retained current UTC-month request/token records for permitted
clients only; nullable/unknown token information is not invented. Provider cost
summary is owner-only and includes unknown-cost counts. These are recorded costs,
not subscription invoices, staffing fees, AOC fees or a billing mutation. Audit
combines this agency's administration actions with sanitized existing client
operations for its permitted clients. Platform/foreign audit and private payloads
are excluded. Views are bounded to 100 rows and explicitly report the permitted
client count; large-estate pagination beyond that remains a later refinement.

## Local invitation contract

Invitations address an **existing portal account identifier**, not a name match
or employer relationship. The inviter may offer only roles within their authority.
Agency Administrator can invite staff or client users; only Agency Owner can
offer agency-admin membership. No invitation can confer ownership/platform status.

No mail transport is used. Recipients sign in and explicitly accept at
`/admin/agency/invitations` through GET/POST
`/api/admin/agency/invitations`. Only the named recipient can see/accept their
24-hour pending invitation. Acceptance rechecks current inviter authority, agency
status, expiry, role and client ownership. Foreign client grants, duplicate active
memberships, revoked invitations and downgraded inviters are denied atomically.
Membership in another agency is possible only through a separate explicit consent.

This is an in-portal local inbox, not a production email-delivery or new-identity
registration claim. Sending real invitations/new-account onboarding requires
named approved recipients and a separately configured/approved transport. HR,
coaching, payroll and specialist engagement data are not added to this interface
or to AI retrieval. Stage 13A is not implemented.

## Gate and database setup

The public `/agency` and `/api/agency` paths still return 404. Non-AOC client entry
and all Stage 11 deployment holds remain unchanged. The **local-only** review
flag `LOCAL_AGENCY_ADMIN_REVIEW` is default-closed and accepted only with an HTTP
`127.0.0.1` auth origin and matching loopback synthetic
`aoc_stage04_rehearsal_<hex>` database name, without connection query overrides.
Even with that flag, real session/membership/owner/resource checks still apply.
The new `.env.example` entry is blank; it is not an external rollout switch.

Versioned `009_agency_administration.sql` adds three ENABLE/FORCE-RLS
owner-controlled tables, narrow SECURITY DEFINER functions with fixed search
paths, and deferred owner invariants. Runtime accesses use `lib/database.js`;
operator provisioning uses `lib/postgres.js`; migrations use a short-lived `pg`
client. No provider SDK/extension or runtime disable flag was added. Stage 11
role guards remain, and legacy shared-service access is still the documented
trusted-server model, **not universal tenant RLS on legacy tables**.

Prepare a disposable Stage 04 synthetic database plus prerequisites and migrations
003–008 first. Use an ordinary non-owner runtime LOGIN and a separate private
operator. Never point these operations at `.env.local`/Neon. Configure an ignored
`.env.agency-stage13` privately with `DATABASE_URL`,
`AGENCY_MIGRATION_DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`.
The current retained Stage 13 review uses `http://127.0.0.1:3001`, keeping the
Stage 12 review on port 3000. The launcher also accepts port 3000 if it is free.

```powershell
node --env-file=.env.agency-stage13 scripts/migrate-agency-administration.mjs --confirm-database <approved_local_name> --app-role <ordinary_runtime_login>
node --env-file=.env.agency-stage13 scripts/seed-agency-review.mjs --confirm-database <approved_local_name>
node --env-file=.env.agency-stage13 scripts/dev-platform-review.mjs --agency-admin
```

The seed refuses to overwrite `.tmp/agency-admin-review/accounts.json` or an
existing synthetic agency. Preserve it and use the existing fixture, or prepare
a fresh approved profile. The launcher uses the already verified production
build for `--agency-admin`, with the local review flag, provider/operator settings
scrubbed and no workers started. The default Stage 12 launcher remains unchanged.
Rebuild in a private, remote-excluded shell if application source changes.

### Review now

- Login: **http://127.0.0.1:3001/login**
- Agency selector: **http://127.0.0.1:3001/admin/agency**
- Harbor: **http://127.0.0.1:3001/admin/agency?agency=s13-harbor**
- Summit: **http://127.0.0.1:3001/admin/agency?agency=s13-summit**
- Local invitation inbox: **http://127.0.0.1:3001/admin/agency/invitations**

Open the ignored private `.tmp/agency-admin-review/accounts.json` in your editor.
Use **`accounts.ownerA.username` / `accounts.ownerA.password`** for Harbor owner,
or `accounts.ownerB` for Summit. `adminA` tests lower admin privileges, `staffA`
and `staffB` test delivery, `multi` tests agency selection, `clientA` tests client
role denial, and `platformOnly` confirms platform role alone cannot enter agency
delivery. Credentials never belong in chat/Git. Account identifiers in this
fixture are for local invitation testing only. Sign-in may land at the client
root; open the agency URL directly. Do not use the separate Stage 12 owner account
on this new database. Browser cookies are host-scoped across ports; separate
browser profiles/private windows help when comparing the two review databases.

The Stage 13 retained server/database remain running for review. Its non-secret
process/status metadata and logs are in the original checkout's ignored
`.tmp/stage13/`; generated settings are in the primary ignored profile. The
separate acceptance database/server were cleaned up. Do not stop an unrelated
database/server by port alone; use the recorded process/data-directory identity.

## Verification and pending work

Actual results are in PROGRESS and ISOLATION-EVIDENCE. Real PostgreSQL and Better
Auth tests are separate from mocked/offline source/AI/provider regressions. Chrome
tests exercise the actual project routes/build, role denials, ownership, local
consent, stale role/access and workspace switching. No real-provider, payment,
message, production account or production database was used.

For a fresh acceptance repeat, privately provide the existing disposable
`AGENCY_WORKSPACE_TEST_DATABASE_URL`, distinct runtime `DATABASE_URL`, synthetic
auth origin/secret, `LOCAL_AGENCY_ADMIN_REVIEW=true`, and an ignored
`AGENCY_ADMIN_FIXTURE` path ending `.tmp/<run>/agency-admin-fixture.json`. Then
use `npm run test:agency:administration` and, with the matching isolated build/server,
`npm run test:agency:administration:browser`. The fixture refuses a remote target
and existing fictional agencies. It is stateful; always start a fresh rehearsal.

Live hosted-AI privacy, deployed private CDN/cache, deployed roles/pooler behavior,
provider resource consent/revocation, scheduler delivery, rotation/restore and
other supported browsers remain pending. The existing Google next-check /
15-minute source freshness revocation window is unchanged. No production mail,
provider onboarding, source publication approval or financial changes are claimed.
Real initial owners/agency activation require separate approved identities and
rollout decisions. Stop before Stage 13A. Do not push.
