# Primary project handoff — Stage 01–04

Prepared November 18, 2026. **Primary project:** `C:\Users\MY PC\Desktop\AI\portal`.
**Stop before Stage 05.** Stage 04 passed the approved synthetic local rehearsal
in the source worktree. It has not been applied or rerun in this primary checkout.

## Repository and document comparison

| Location | Observed state |
| --- | --- |
| Primary `AI\portal` | Clean `master` at `916bbf5b781ea0dd7b3b685d5517694dad4185a7` before this transfer; no `docs/agency-platform` or agency migration/helper files existed. |
| Source `AOC\chatkit` | Dirty original master at `786b3b56468ffda6c1561c21894bb928e15e41d0`; original local fixes and environment preserved. Root documents contain historical inventory/design and progress pointers. |
| Source `AOC\chatkit\.tmp\agency-platform-isolation` | `feat/agency-platform-isolation`, HEAD/base `916bbf5b781ea0dd7b3b685d5517694dad4185a7`; Stage 03–04 code and documentation are **uncommitted**. |

Both source document sets were compared. Worktree CONTEXT/DECISIONS preserve the
earlier Stage 01–02A body and extend it with Stage 03–04. Worktree PROGRESS contains
the detailed implementation/verification that the source root's newer progress
pointer summarizes. The authoritative worktree versions of the following five
files were merged into this previously absent directory, with this primary-folder
notice and source-cross-worktree document links localized. No target agency edits
existed to overwrite. All other existing target files are preserved, and every
source copy is retained.

- [CONTEXT](CONTEXT.md): baseline/reuse inventory and current stage context.
- [DECISIONS](DECISIONS.md): agency permissions/ownership, three independent offers,
  Stage 03 isolation and Stage 04 adoption/cutover boundaries.
- [PROGRESS](PROGRESS.md): detailed actual results and pending checks.
- [STAGE03_DATABASE](STAGE03_DATABASE.md): additive schema, roles and SQL acceptance.
- [STAGE04_REHEARSAL](STAGE04_REHEARSAL.md): inventory, quarantine, private setup,
  write freeze, backup/restore, cutover and rollback.

Historical paths/statuses in these files describe the source work; this document
controls the current primary-folder handoff. Copied source files are not evidence
that their implementation already exists here.

## Migration code missing from the primary checkout

There is **no Stage 03 or Stage 04 commit to cherry-pick**: the source branch's
HEAD still equals `916bbf5`, and all implementation changes are in its working
tree. Checking out that branch or cherry-picking the base commit will not import
them. No code was copied, committed, merged or pushed by this documentation task.

The exact uncommitted files that need a reviewed Git change follow. Paths are
relative to source `.tmp/agency-platform-isolation` and to the primary repo root.

### Stage 03 — new files

- `database/agency-platform/000_role_setup.sql`
- `database/agency-platform/001_agency_foundation.sql`
- `lib/agency-database.js`
- `lib/agency-scope.js`
- `scripts/agency-platform-config.mjs`
- `scripts/check-agency-platform-database.mjs`
- `scripts/migrate-agency-platform.mjs`
- `tests/agency-platform.test.mjs`

### Stage 04 — new files

- `database/agency-platform/002_legacy_adoption.sql`
- `lib/legacy-agency-compat.js`
- `scripts/agency-backfill-plan.mjs`
- `scripts/migrate-agency-backfill.mjs`
- `tests/agency-backfill/fixture.mjs`
- `tests/agency-backfill/plan.test.mjs`
- `tests/agency-backfill/rehearsal.database.test.mjs`

### Existing reviewed files with required modifications

- `lib/portal-data.js`
- `lib/prepared-source-store.js`
- `package.json`
- `tests/drive-sources/prepared.test.mjs`

`package.json` carries both stages' migration/test commands. The other existing
files carry AOC membership/publication compatibility and adjusted source mocks.
The fifteen new files plus these four modifications are the complete **19-file
application/schema/test delta**. The five agency documents are already imported
here; preserve the new HANDOFF notice when reconciling them with future commits.

The source `.env.example` also has blank setup placeholders for
`AGENCY_MIGRATION_DATABASE_URL`, `AGENCY_TEST_DATABASE_URL` and
`AGENCY_BACKFILL_DATABASE_URL`. **No `.env` file, including `.env.example`, was
copied or changed in the primary project.** Any future template-only change needs
separate review and must contain names/comments only. Never bring private
`.env.local`, `.env.agency-test`, `.env.agency-stage04-flows`, archives or ignored
evidence through Git. They were neither copied nor used as primary configuration.

For the future Git transfer, review/stage only the listed files in the source
implementation worktree, produce a reviewable commit (or explicit path-limited
Git patch), and import that into an agency implementation branch based on
`916bbf5` in **AI\portal**. The recommended branch name there is
`feat/agency-platform-isolation`; currently only `master` exists in this separate
repository. The missing implementation is not available from a commit until that
review/commit happens. Do not cherry-pick the unrelated dirty original master or
copy an entire directory. Preserve these merged docs when importing code.

## What actually passed Stage 04

Stage 03 prerequisite acceptance passed nine real PostgreSQL groups on the
approved local target. Stage 04 then used fresh synthetic local databases on the
same rootless WSL PostgreSQL 18.3 server, leaving Neon untouched:

- 46 relations / 51 legacy records inventoried; 27 client, 1 AOC agency guidance,
  16 private and 7 quarantined; zero conflicts.
- Two PostgreSQL READ ONLY dry runs left complete table/sequence/trigger snapshots
  unchanged. Reports were identical.
- First application assigned 51 ownership rows. Second changed zero; complete
  database states matched, without duplicate records or audit entries.
- Existing IDs, conversations/items, upload bytes, workspace, archived usage/reset
  history, pricing versions and historical pricing pin were preserved.
- Eight real SQL scenario groups passed: ownership/conflict rollback, writer
  exclusion, foreign/private/quarantine denial, pooled cleanup, actual legacy AOC
  client DAL flows, atomic new writes and membership/source revocation.
- Pre-backfill custom backup restored to a separate empty database with all table
  rows/counts/triggers and logical sequence state intact. Internal sequence WAL
  counters are separately documented; they are not customer identifiers.
- All 14 agency tables had FORCE RLS; restricted groups were checked. Twenty-nine
  offline tests and focused lint passed. The task PostgreSQL server was stopped.

Authentication session and the Internal guard were mocked in the SQL client-flow
test. Real browser/Better Auth sign-in, Python ChatKit replies, live providers,
external poolers, production role/key restoration, real customer snapshot, scale
and post-cutover write replay remain unverified. Broad legacy service/owner
credentials are explicitly outside the RLS claim. No agency mode was exposed.

The **source worktree full build did not pass**: Turbopack could not resolve
parent-level Next.js within its configured worktree root; the webpack alternative
reported missing installed `cheerio`, `robots-parser` and `ipaddr.js` for existing
Website Insights code. Those dependencies were already declared at the reviewed
base. No claim is made about the primary checkout's build: it was not run here.
Historical passing Stage 01 build results belong to the original dirty master.

## Where Stage 05 should run and what is pending

Stage 05 belongs in **`C:\Users\MY PC\Desktop\AI\portal`**, on its reviewed
agency implementation branch after importing the missing Stage 03–04 Git changes.
It must not run in the old AOC folder or assume that transferred documents alone
enable agency ownership. Recheck Git state, installed dependencies and the
imported code; rerun relevant acceptance against an explicitly approved disposable
target before depending on its data model. This handoff starts none of that work.

No primary-project database was contacted or provisioned. The presence of its
private `.env.local` was verified without copying or displaying contents; no live
runtime/provider configuration was audited. Dedicated agency migration/test URLs
were not transferred. Configure `AGENCY_MIGRATION_DATABASE_URL`,
`AGENCY_TEST_DATABASE_URL` and `AGENCY_BACKFILL_DATABASE_URL` privately in the
primary repo's ignored `.env.agency-test` for a later approved local check; never
default to the current application database. No provider sign-in is required for
this docs/Git inventory. Production adoption remains a separate approval step.

**Current stop gate: docs merged; implementation transfer pending; Stage 04 passed
locally in the source only; Stage 05 not started.**
