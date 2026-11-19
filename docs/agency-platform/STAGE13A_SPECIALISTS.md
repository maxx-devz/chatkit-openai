# Stage 13A — scoped specialist delivery

Base `4316efd`, `feat/agency-platform`, primary checkout
`C:\Users\MY PC\Desktop\AI\portal`. Local engineering with synthetic specialists
and disposable PostgreSQL only. Stage 14 is not started. Platform ownership,
existing agency/client roles, Internal roles/panels and external gates remain.

## Authority and data contract

Staffing engagement, agency membership and assignment are separate records.
Recording an engagement does not create membership, client access, invitations or
software rights. It can exist **without a portal identity**. An administrator may
later link an existing approved non-Internal account; linking still grants no
client access. Name/employer/payment matches are never authorization inputs.
An existing linked identity cannot be silently swapped: use a new engagement
and explicitly replace the assignment.

Only an active Agency Owner or Agency Administrator can approve, revoke, replace,
link or end work **inside their agency**. Delivery staff, Client Administrators,
platform-only actors, unrelated specialists and Whitecap managers cannot approve
assignments. These decisions reuse Stage 13's live agency/session authorization;
no new leadership decision is needed to grant a manager automatic customer access.

An assignment binds all of: agency, client, engagement, exact account, work type,
delivery role, responsibilities, deliverables, business handoff, active same-agency
administrator review owner, approving actor, explicit action list, explicit file
IDs and expiry. Allowed work types are development/design/SEO/content/operations.
Expiry must be future and at most 90 days after approval. Read is mandatory;
file read and note write are optional independent actions. No request can add
agency/platform, financial, general AI or Internal HR permissions to this list.

Approval establishes only a narrow active agency membership (`client_user`) if
needed; it never creates legacy client membership/client_access or promotes an
existing inactive membership. The assignment's own ACL grants delivery rights.
An account's independently approved pre-existing permissions remain independent;
ending an engagement does not silently change unrelated customer memberships.

Temporary coverage and replacement use the same administrator approval path and
finite expiry. Replacement creates a new assignment and atomically marks the old
one replaced. It must remain in the same client and agency; the new engagement/
recipient/review owner/files/actions are revalidated. Old URLs/job contexts cannot
be reused. Ending an engagement revokes all its active assignments. Reopening a
past assignment is unavailable: obtain a new explicit approval. History/audit is
preserved and concurrent/stale replacement/revocation fails safely by revision.

## Surfaces and implemented actions

| Surface | Authority / behavior |
| --- | --- |
| `/admin/agency/specialists?agency=<slug>` | Agency administrator UI, linked from the existing agency navigation; engagement records, link/end, assignment approval, replacement and revocation |
| `/api/admin/agency/specialists` GET/POST | Fresh session + Stage 13 agency role, active operational workspace, origin and strict field/action checks; database rechecks resource ownership |
| `/delivery` | Specialist's own active assignment choices; explicit assignment selection, not an implicit current agency |
| `/delivery?assignment=<uuid>` | Approved business context, responsibilities, deliverables, review owner, handoff, expiry, allowed files and notes |
| `/api/delivery` GET/POST | Reauthorized assignment read / idempotent allowed note write; no client/agency overrides |
| `/api/delivery/files/<id>?assignment=<uuid>` | Live session, assignment, action, exact selected file and client checks on **every request** |

Specialists receive no agency administration, client portal, general ChatKit,
Hubstaff/source synchronization or Website Insights job entitlement from this
assignment. Existing client/AI authorization remains unchanged and denies
specialist-only accounts. No provider call or paid AI workflow was introduced.

### AI evidence and personnel exclusion

The SQL `specialist_evidence` function, Next `withSpecialistWork(...).evidence()`
and Python `specialist_access.py` expose a strict business-field projection only.
They do not query HR, coaching, payroll, leave, recruitment, personnel records,
private admin guidance, unapproved source caches or arbitrary files/notes. The
evidence is marked untrusted data; text/file instructions cannot grant tools or
change scope. Existing client response privacy filters are untouched.

This provides an authorization boundary for specialist-aware tools; it is **not**
connected to a new specialist ChatKit chat or a general AI permission. Tests
exercise actual SQL/Python retrieval and a deterministic **mocked** answer from
the approved evidence, with private HR canaries excluded. No live model answer,
tool round trip or hosted-AI privacy pass is claimed. A future real AI consumer
must use these checks before retrieval/tool/write/delivery, retain privacy filters
and have separate approved provider/data-destination configuration.

Assignment fields and selected customer files must contain delivery information
only. The UI and allowlisted schema exclude personnel-field inputs; this is not
an automatic classifier of every possible sentence or uploaded file. The agency
approver is responsible for selecting permitted business files/context. The
synthetic private HR fixture is a test canary, not a new HR product/module or
real personnel import. Staffing-only customers still need no portal account.

### Sessions, work and file revocation

SQL rechecks the unexpired real Better Auth session, non-Internal identity,
active agency/governance/membership/client, correct engagement, current assignment,
permitted action, active review owner and wall-clock expiry. A reviewer becoming
Internal or losing agency-admin authority blocks subsequent specialist retrieval.
Grant approval is durable; approver departure is not silently confused with the
review-owner role. A pause in agency/client access blocks requests; permanent
assignment cancellation requires revoke/end/replace. No billing changes occur.

`withSpecialistWork` checks before work, before protected writes, after writes
within the transaction and before output. Python has equivalent explicit scope
recheck. Tests show in-flight revocation denies output and expiry rolls back a
pending write. Note operations recheck after acquiring their idempotency lock and
before completion. This is a consumer contract for scoped work, **not a new queue,
scheduler or delivery service**. Existing background job rights remain denied to
specialist-only accounts; Stage 10's worker controls/leases are unchanged.

Downloads reuse the existing authenticated PostgreSQL library and sanitized private
download headers. Only selected client library files are available; generated
per-user assets and unrelated files are not automatically shared. No signed URL
or bearer file grant is minted: there is **no residual signed-link validity
window**. A copied URL requires live assignment access again. Responses are
private/no-store, attachment-only, nosniff and sandboxed. An already authorized
in-flight response or bytes downloaded before revocation cannot be recalled.

The delivery UI rechecks on focus, explicit refresh and every 15 seconds, and
reloads authorization on a persisted page restore. Already displayed metadata can
therefore remain until that refresh; server requests enforce revocation/expiry
independently. This is not a claim of instant deletion from another browser.

## Schema, portability and gate

`010_specialist_assignments.sql` adds engagement, assignment and note tables, all
ENABLE/FORCE-RLS with owner-controlled policies; typed/FK scope constraints and
narrow fixed-search-path SECURITY DEFINER functions enforce the access contract.
No existing users, grants or sources are adopted. Runtime uses lib/database.js;
provisioning lib/postgres.js; migrations short-lived pg clients; Python uses its
guarded database connector. Existing owner/BYPASSRLS/inherited-role/pooled SET ROLE
guards remain. The shared legacy service is still the documented trusted-server
model, not universal tenant RLS on legacy tables. No provider SDK/extension added.

The new surfaces reuse the existing default-closed **LOCAL_AGENCY_ADMIN_REVIEW**
gate and require HTTP loopback plus a synthetic loopback rehearsal database.
`/agency`, `/api/agency`, non-AOC client entry and external rollout remain gated.
There is no new production secret or public release flag. Source freshness and
Google revocation windows from earlier stages remain unchanged.

## Review now / private setup

The preserved Stage 12/13 reviews remain on ports 3000/3001. A **separate** retained
synthetic specialist database/server is ready at port **3002**:

- Login: **http://127.0.0.1:3002/login**
- Agency approvals: **http://127.0.0.1:3002/admin/agency/specialists?agency=s13-harbor**
- Specialist delivery: **http://127.0.0.1:3002/delivery**

Open ignored **`.tmp/specialist-review/accounts.json`** privately in your editor.
For approvals use **`accounts.ownerA.username/password`** (Harbor) or `ownerB`
(Summit). For delivery use **`specialists.specialistA.username/password`**: that
account has two separately approved agency/client assignments. `specialistB` is
available for replacement approval; `whitecapManager` has no automatic customer
access; `internalSpecialist` remains protected by the independent Internal guard.
Do not paste credentials into chat. Sign in, then open the route directly; the
client-root “no client assigned” message does not replace the specialist check.
Different review databases use different identities. Cookies share the loopback
host across ports; separate browser profiles help when comparing reviews.

Private **`.env.specialist-review`** contains generated disposable DATABASE_URL
(ordinary runtime), AGENCY_MIGRATION_DATABASE_URL (separate operator),
BETTER_AUTH_URL (port 3002) and BETTER_AUTH_SECRET. Existing `.env.local` and prior
review profiles/accounts are preserved. No local prerequisite is missing after
setup. These profiles/fixtures/logs remain ignored, not part of the commit.

For a new fixture, prepare the approved synthetic Stage 04 adoption and existing
003–009 prerequisites first, then run from the primary checkout:

```powershell
node --env-file=.env.specialist-review scripts/migrate-specialist-assignments.mjs --confirm-database <approved_disposable_name> --app-role <ordinary_runtime_login>
node --env-file=.env.specialist-review scripts/seed-specialist-review.mjs --confirm-database <approved_disposable_name>
node --env-file=.env.specialist-review scripts/dev-platform-review.mjs --agency-admin
```

The seed refuses existing fictional agencies or overwriting its private account
file. It creates new synthetic accounts, separate engagements, approved business
files, private test-only HR canaries and explicit administrator-approved A/B
assignments. No real user promotion/invitation/message occurs. The launcher uses
the verified production build, excludes provider/operator secrets and starts no
source/Hubstaff watcher. Do not point these commands at Neon or real snapshots.

For real database/browser acceptance, privately provide the existing synthetic
operator AGENCY_WORKSPACE_TEST_DATABASE_URL, separate runtime DATABASE_URL,
synthetic auth settings, LOCAL_AGENCY_ADMIN_REVIEW=true, a prepared
AGENCY_ADMIN_FIXTURE and ignored SPECIALIST_FIXTURE output ending
`.tmp/<run>/specialist-fixture.json`. Run `npm run test:specialists:database` and,
against the matching isolated build/server, `npm run test:specialists:browser`.
Use a fresh fixture: tests are stateful and refuse remote/mismatched targets.

## Evidence and stop boundary

Actual commands/results are in PROGRESS and ISOLATION-EVIDENCE. Real DB/session/
Python/browser checks are distinguished from offline mocks and live AI/provider
checks. The acceptance cluster/server were stopped and removed; retained review
servers remain running. Non-secret process/status metadata and private logs are
in the original checkout's ignored `.tmp/stage13a/`; stop only the verified
recorded processes and disposable cluster.

Live hosted-AI privacy, deployed private cache/CDN, deployed roles/pooler mapping,
provider consent/resource checks/revocation, scheduler delivery, rotation/restore
and other supported browsers remain pending. No live AI, real personnel, real
recipient, payment or production access was used. Stage 20B publication workflow
remains later work. External rollout HOLD; stop before Stage 14. No push.
