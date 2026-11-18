# Stage 04 — legacy AOC ownership rehearsal

> Primary project handoff: use `C:\Users\MY PC\Desktop\AI\portal`. The results below were recorded in the AOC source worktree. Stage 03–04 code has not yet been imported into this primary checkout. See [HANDOFF](HANDOFF.md) for exact Git files, local-only verification limits and the Stage 05 stop gate.

Verified November 18, 2026, on local PostgreSQL 18.3 in Ubuntu WSL. Implementation
is the existing `feat/agency-platform-isolation` worktree at reviewed base
`916bbf5b781ea0dd7b3b685d5517694dad4185a7`. No Neon connection, production backfill,
provider request, payment, real message or agency-mode rollout was performed.
Stop before Stage 05. [Progress](PROGRESS.md) records actual checks and limits.

## Data and ownership contract

`002_legacy_adoption.sql` extends the existing ownership namespace; it does not
rewrite legacy primary keys, conversation JSON, file bytes, timestamps, usage
resets, cost events or pricing versions. Version 001 is unchanged. The runner
checks the version-002 checksum and refuses a changed applied migration.

The private reviewed manifest explicitly selects AOC client IDs, approved agency
administrators, an operator, the company guidance publisher/key, an approval
reference and the existing legacy application database role. The AOC workspace
uses the reserved slug `aoc`. An existing unrecognized workspace with that slug
requires explicit `expectedAgencyId` confirmation. Existing foreign agency
ownership is retained; a manifest trying to adopt it is rejected.

Existing customer memberships become `client_user` agency memberships with their
existing client access levels and activation state. They do not become agency
staff or agency administrators. Only explicitly reviewed active AOC administrators
receive the latter role. `portal_clients`, `portal_users` and
`portal_memberships` remain the legacy identity/membership source.

| Overlay | Purpose |
| --- | --- |
| `backfill_batches` | Deterministic manifest/source digest, reviewer reference and operator; identical application adds no batch. |
| `backfill_state` | One AOC workspace and atomic compatibility activation marker. |
| `legacy_catalog` | Reviewed primary keys, record family, payload access class and write-hook coverage. |
| `source_approvals` | Explicit approval of AOC company guidance; no implicit platform-common source. |
| `legacy_ownership` | Unique relation/key, scope, owning agency/client, private-user selector, source fingerprint and lineage. |
| `legacy_ownership_audit` | Append-only ownership/fingerprint changes, including post-cutover write/deletion hooks. |

All six tables have ENABLE/FORCE RLS and owner-only policies. The complete
namespace now has **14** FORCE-RLS tables. NULL ownership means either explicitly
private platform operations or quarantine; it never grants tenant visibility.

## Inventory and privacy

The runner catalogs every ordinary/partitioned `public.portal_*` table except
`portal_internal_*`. A stable primary key is required. It checks native foreign
keys and computes row fingerprints inside PostgreSQL. The report contains table
counts, digests, intended scope, actions and opaque record references. It does
not export source text, credential values, raw record IDs or customer names.

Known client families cover identity bindings, workspace/knowledge, work/general
conversations and items, uploads/library/generated assets, AI requests/costs and
archived resets, credit periods/entries, operational audit/integration runs,
Website Insights, Hubstaff indexes/tasks/comments and assistant builder versions/
files/usage. Empty relations are reported too. Unknown relations and orphans are
held for review. No Internal record or personnel pipeline is migrated.

Shared provider selection/model settings, AI credentials, Hubstaff tokens, Drive
OAuth grants, encrypted prepared-source caches, pricing versions and platform
identity remain **platform_private** control-plane records. This does not grant
agencies access to the shared credentials. Existing encrypted content and key
material are not regenerated. Future agency credential routing remains separate.

Only the explicitly reviewed company-guidance publication becomes **AOC agency**
knowledge. Private administrator packs remain private. Client publications need
both an AOC-owned client and an approved publisher. A missing/unapproved owner,
unknown client, archived NULL client, missing parent or unreviewed relation is
quarantined. An ambiguous client-shared/user-private record inside the selected
cohort blocks application until resolved, because old client queries must not
silently retrieve such records. Ambiguous publications are filtered before
retrieval. Production ambiguity needs a reviewed private manifest or a sanitized
reference decision; never guess ownership from branding, names or shared secrets.

## Fictional rehearsal and reconciliation

Two approved legacy AOC clients, Orchid and Birch, were adopted into AOC. Pine
belongs to fictional Harbor Agency and stayed there. A fourth legacy client had
no approved owner and stayed quarantined. No real Accenture tenant was created.
The fixture deliberately gives an AOC user broad legacy memberships, including
Harbor and the unapproved client, to verify that those memberships cannot expose
them through the existing AOC client shell.

There were **46 inventoried relations / 51 legacy records**, including preserved
July 2025 usage, cleared events, reset history, two pricing versions and a period
pinned to its historical version. The new registry classified them as follows:

| Scope | Records |
| --- | ---: |
| Client, including the already-owned Harbor data | 27 |
| AOC agency guidance | 1 |
| Platform private | 16 |
| Quarantined | 7 |
| Total | 51 |

The sanitized unresolved fixture references are below. These are synthetic test
cases, not a request to assign real customer data.

| Reference | Reason |
| --- | --- |
| `portal_ai_cost_events:d60439563faff58ccd59` | Archived/ambiguous NULL client; preserve cost history, withhold tenant retrieval. |
| `portal_clients:2aebb2d31d8603a57adb` | Client not included in the approved AOC cohort. |
| `portal_memberships:bb6cb167754137b25fdd` | Membership of that unapproved client. |
| `portal_source_publications:3af24427435a34d5e89f` | Publication for that unapproved client. |
| `portal_source_publications:c97b9e90a788bfb856ce` | Publisher not approved for AOC. |
| `portal_legacy_fixture_notes:ebe7289e33e317da132f` | Orphan client reference. |
| `portal_legacy_fixture_notes:c06f948baccdaf8b079c` | Unreviewed relation, despite a valid client reference. |

Two dry runs used explicit PostgreSQL **REPEATABLE READ, READ ONLY** transactions
and ROLLBACK. Reports matched. Independent full logical snapshots of all public
and agency table rows, sequence state and custom triggers matched before/after
each dry run. No agency, ownership record or audit row was created by reporting.

The first application added 51 ownership records and one AOC workspace/batch.
The second changed **zero** ownership records. Full database snapshots after
applications one and two were identical, including new audit rows and sequences.
Every original legacy table and sequence matched the pre-backfill snapshot.
Thus identifiers, content and archived financial/conversation history survived;
this was not just a comparison of row counts.

## Enforced reads and legacy compatibility

`owned_legacy_record` is an owner-controlled, parameterized lookup with a fixed
trusted search path. It validates the Stage 03 bound LOGIN, active agency/actor,
selected client grant, record scope and exact fingerprint. Private per-user
records also require the same actor. Platform-private, quarantined and foreign
records return no payload. Runtime has no direct backing-table or registry SELECT
grant. The caller must still authenticate the human; DB scope is not sign-in.

The existing client DAL now filters authenticated legacy memberships to the
adopted AOC cohort after resolving the session. Shared/client AI source retrieval
uses the ownership predicate before selecting publication metadata. Publisher
deactivation immediately removes its knowledge. Before the activation marker
exists, these paths retain their original behavior; an installed inactive marker
fails closed. No activation cache delays revocation.

The existing legacy application database role still has broad trusted legacy
access. It is **not** claimed to be protected by agency RLS. Only three narrow
compatibility predicates are granted to it; it cannot read the new registry.
New agency LOGINs remain restricted and no new tenant route is exposed. Existing
global Admin operations, Python service credentials and Internal Portal are not
converted to agency runtime in Stage 04.

Eight real SQL scenario groups passed: ownership/history reconciliation;
foreign-owner conflict and full rollback; concurrent-write exclusion; ordinary
foreign/private/quarantine read denial; same-backend scope cleanup after commit
and rollback; existing AOC DAL flows; atomic post-cutover writes and membership
revocation; and source publisher deactivation. Client selection, workspace,
work/general history, AI allowance and credit report paths used actual SQL and
the real restricted legacy application LOGIN. Only the authentication session
and Internal-user guard were mocked. New conversation rename/delete exercised
the existing repository method/write trigger. All seeded legacy history stayed
identical after these checks; expected session upserts changed only user update
timestamps and that identity sequence.

Not verified: browser/real Better Auth login, live ChatKit/Python replies, provider
billing, Google consent/decryption with real keys, Hubstaff sync, external poolers,
Neon roles or a production-scale snapshot. Website Insights and job relations
were inventoried from actual schema but empty in this fixture; their live flows
are not certified. No production snapshot or provider sign-in was needed here.

## Private setup and rerun commands

The original `.env.local` was not copied, read for connection use, or changed.
Private local URLs are stored in ignored files with access limited to the Windows
owner, sandbox account and SYSTEM. No connection values belong in chat or git.

| Name / file | Runtime and current status |
| --- | --- |
| `AGENCY_MIGRATION_DATABASE_URL` in `.env.agency-test` | Standalone Node Stage 03 foundation target; retained local value. |
| `AGENCY_TEST_DATABASE_URL` in `.env.agency-test` | Stage 03 dedicated acceptance target; retained local value. |
| `AGENCY_BACKFILL_DATABASE_URL` in `.env.agency-test` | **New** standalone Node Stage 04 target; generated local bootstrap value configured. Blank example placeholder only. No `DATABASE_URL` fallback. |
| `DATABASE_URL` in `.env.agency-stage04-flows` | Real legacy DAL SQL tests only; generated non-owner local application LOGIN for the rehearsal database. |

No Stage 04 rehearsal configuration is missing. A fresh machine needs approved
local PostgreSQL and generated private URLs/roles before SQL checks. A browser
application in this worktree remains intentionally unconfigured: set its own
`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
`PROVIDER_SETTINGS_SECRET` and `NEXT_PUBLIC_CHATKIT_DOMAIN_KEY` privately in
`.env.local` when that separate check is authorized. A deployed Next/Python pair
also needs appropriate `CHATKIT_BACKEND_URL`, matching `CHATKIT_BACKEND_SECRET`
and Python database/provider configuration. This stage neither copies production
secrets nor requests provider sign-in. See [setup](../CHATKIT_SETUP.md) for runtime
configuration and [Stage 03](STAGE03_DATABASE.md) for role/prerequisite details.

`tests/agency-backfill/fixture.mjs` exports `prepareLegacyFixture` for a new empty
approved local database. It loads versioned legacy prerequisite schemas, role
setup and version 001, seeds synthetic legacy records and creates the private
manifest/application URL. It refuses a nonempty database. The real test requires
loopback, a Stage-04 rehearsal database name, matching application/bootstrap
targets and synthetic fixture sentinels. It must run on a freshly adopted fixture;
its deliberate write/tombstone checks make later state different by design.

The CLI commands below use private files and the **exact approved local database
name**. `approved-aoc-manifest.json` represents a private reviewed file, not a
committed data dump. Confirm host/port/database/login identity before writes.

```powershell
node --env-file=.env.agency-test scripts/migrate-agency-backfill.mjs --dry-run --manifest approved-aoc-manifest.json --confirm-database <approved-local-name> --report dry-run-1.json
# Independently compare all table/sequence/trigger state before and after reporting.
# Take and verify the pre-backfill backup before --apply.
node --env-file=.env.agency-test scripts/migrate-agency-backfill.mjs --apply --manifest approved-aoc-manifest.json --confirm-database <approved-local-name> --report apply-1.json
node --env-file=.env.agency-test scripts/migrate-agency-backfill.mjs --apply --manifest approved-aoc-manifest.json --confirm-database <approved-local-name> --report apply-2.json
node --test tests/agency-backfill/plan.test.mjs
node --env-file=.env.agency-test --env-file=.env.agency-stage04-flows --conditions=react-server --experimental-test-module-mocks --import ./tests/internal-user/aliases.mjs --test tests/agency-backfill/rehearsal.database.test.mjs
```

These PowerShell database-name placeholders must be replaced privately before
execution. Report paths refuse overwrite. Reports with conflicts return without
application, with exit status 2 for `--apply`; database errors emit safe codes.

Machine-local orchestration/evidence is retained under the original checkout's
`.tmp/agency-stage04-local/`: identity metadata, private manifest, dry-run/apply
reports, independent snapshots, backup and restore helpers, build logs and
`verification-results.json`. Nothing there is a production export or secret
handoff mechanism. The same rootless Stage 03 WSL cluster was restarted; two
fresh databases separated the rehearsal from backup restore.

## Backup, write handling, cutover and rollback

1. Before a real migration, obtain a separately approved staging snapshot and
   verify its host/database, owner/service roles, exact schemas, restore access,
   encryption-key availability, orphan inventory and reviewed ownership manifest.
   Do not reuse this synthetic authorization for customer/production data.
2. Deploy the compatibility code first. With no Stage 04 marker it retains legacy
   behavior. Verify all existing entry points on the staging copy. Never expose
   agency mode or new agency routes before the later Stage 11 gate.
3. Schedule an explicit maintenance window for **all** legacy writers: web,
   Python, workers, cron, administrative scripts, provisioning and schema changes.
   Drain requests/jobs. Pause new client creation and ownership transfers. Queue
   work upstream with durable retry/idempotency keys; do not accept unrecorded
   writes in a browser or memory-only worker.
4. While writers are paused, take a provider-independent custom-format `pg_dump`
   with the approved backup role. Secure the archive and separately protect role
   definitions and stable encryption secrets. Restore into a distinct disposable
   target; compare row fingerprints, counts, sequence values and role grants.
   Preserve the pre-cutover application release as well as the database backup.
5. Run read-only inventory and resolve conflicts. Apply with the reviewed manifest.
   The runner takes an advisory migration lock, SHARE locks on inventoried legacy
   tables and stronger locks on agency identity/grants. READ COMMITTED inventory
   is taken **after** writer locks, avoiding a stale pre-lock snapshot. A competing
   write was verified to time out rather than slip through. DDL is included in
   the transaction; errors/disconnection before commit roll back activation.
6. The validated transaction installs write hooks and activates compatibility
   only at commit. Compare source digests/counts, ownership totals, IDs, history,
   resets, credit pins and scope checks; repeat application and confirm no change.
   Run the restricted-role/client-flow checks before reopening service.
7. Resume existing-client writes and idempotent jobs only after validation.
   Known client tables and publications write ownership/fingerprint/audit changes
   atomically in the same transaction. Unknown/unapproved client records remain
   inaccessible; new-client onboarding requires explicit cohort adoption until
   later provisioning work. Private platform settings are not tenant-readable;
   their inventory refresh is an explicit later run, not an automatic grant.
8. On failure before commit, keep writers paused and investigate the safe code.
   On validation failure after commit but before resuming, restore the verified
   backup into an isolated replacement and roll application/DB back together.
   Merely disabling the marker keeps guarded routes closed; it is not a complete
   rollback. After writes resume, capture/reconcile their durable queue/WAL/deltas
   before any restore and replay idempotently. Blind restoration would lose them.

The local rehearsal created a version-matched PostgreSQL custom archive before
the backfill, then restored it transactionally into the separate empty local
database. All table fingerprints/counts and custom triggers matched the original.
Sequence last values/called state were preserved, including the two used
sequences. Their internal WAL `log_cnt` changed on restore as expected; it is not
an identifier or customer record. This is distinguished from the dry-run and
idempotence snapshots, which matched the entire sequence state exactly. The
same local cluster supplied roles to restore; cross-cluster role/secret recovery,
production backup retention, PITR and post-cutover write replay remain unverified.

The migration uses standard PostgreSQL core SHA-256, catalog queries, locks,
transactions, constraints, triggers and RLS; no provider SDK/extension is added.
See PostgreSQL's [binary functions](https://www.postgresql.org/docs/current/functions-binarystring.html),
[table locks](https://www.postgresql.org/docs/current/sql-lock.html) and
[dump/restore guidance](https://www.postgresql.org/docs/current/backup-dump.htm).

## Build and release boundary

Focused lint passed. **29 offline/regression tests passed** and **8 real SQL
scenario groups passed** (9 TAP tests including the parent). The original default
worktree build is blocked by its dependency layout: `turbopack.root` is the
worktree, while installed Next.js is in the parent checkout. The documented
`--webpack` alternative reached compilation but found missing installed
`cheerio`, `robots-parser` and `ipaddr.js` dependencies required by the existing
Website Insights routes. They were already declared in reviewed `package.json`;
no dependency or framework configuration was changed for this stage. A full
application build is therefore **not passed**. Repair isolated dependency setup
before a staging/browser release check. This does not certify live AI or any
unrun legacy subsystem. Production cutover still requires final approval.
