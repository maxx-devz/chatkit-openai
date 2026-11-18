# Agency Platform progress

> Current primary checkout is `C:\Users\MY PC\Desktop\AI\portal` on `feat/agency-platform`. Stage 06 passed local verification. [Stage 06 results and rollout limits](#stage-06-server-entry-point-ownership)

Updated November 18, 2026, Asia/Shanghai.

## Stage register

| Stage | Status | Evidence / scope |
| --- | --- | --- |
| Stage 01 — baseline and reuse inventory | Complete: documentation and safe local verification | This record, [CONTEXT](CONTEXT.md), [DECISIONS](DECISIONS.md) |
| Stage 02 — agency permissions and data ownership design | Complete: draft design, no enforcement implemented | DECISIONS S02A-D01, D03, D05–D06; CONTEXT §14, including two fictional agencies |
| Stage 02A — three product offers | Complete: draft package rules, no published offer | DECISIONS S02A-D02 and D04; independent platform-only, specialist-only and combined selections |
| Stage 03 — additive agency schema and database checks | Complete for the approved disposable local target | PostgreSQL 18.3: 9 real scenario groups passed; migration CLI apply/repeat and cleanup verified; no Neon/deployment claim |
| Stage 04 — existing AOC ownership migration rehearsal | Complete for approved synthetic local data only | Two no-write dry runs, two idempotent applies, preserved history, quarantine and restore verified; [runbook](STAGE04_REHEARSAL.md) |
| Stage 05 — trusted workspace context | Implemented and verified locally | Real Better Auth sessions, two agencies in PostgreSQL, browser switch and refresh, regression tests and full build. |
| Stage 06 — server entry-point ownership | Implemented and verified locally | Complete route inventory, signed Next.js/Python access checks, four-client denial matrix and migration 004 rehearsal. |
| Stage 07 onward | Awaiting separate authorization | Stage 11 remains the planned gate for public agency routes. |

Older `docs/PHASE_0_*` files describe a separate historical architecture/closeout
process with outstanding reviews. This stage does not mark that process complete
or reuse an old database/deployment approval for today's environment.

## Stage 01 scope and files

Created:

- `docs/agency-platform/CONTEXT.md`: commit/worktree comparison, stack, all page/API
  entry points, Python interfaces, tenancy/shared-resource/data inventory, reuse
  candidates, private configuration gaps and pending target setup.
- `docs/agency-platform/DECISIONS.md`: preservation rules, authority boundaries,
  target/test gate, shared settings, financial-reporting limits and stage stop rule.
- `docs/agency-platform/PROGRESS.md`: actual checks, limitations and next gate.

Application, Internal Portal, Python backend, dependencies, environment/template,
database and existing local source changes were not edited for this stage.
Final preservation checks matched all **545 pre-existing source files** and the
existing private `.env.local` against their pre-stage hashes. Git status gained
only the new `docs/agency-platform/` directory.
Ignored supporting artifacts are under `.tmp/agency-stage01/`; build output is in
`.next`, and the existing browser fixture writes its ignored preview/screenshot
artifacts. These are local evidence, not a deployable release or required handoff
files. The three documents contain the portable findings.

## Repository baseline

- Target: `C:\Users\MY PC\Desktop\AOC\chatkit`, `master` at
  `786b3b56468ffda6c1561c21894bb928e15e41d0`.
- Reviewed commit: `916bbf5b781ea0dd7b3b685d5517694dad4185a7`, obtained read-only
  from the other existing local Git repository. Current HEAD is two commits behind.
- Initial local status: **37 tracked modified paths / 27 untracked status entries**,
  preserved. An untracked status entry may be a directory containing several files.
- Before Stage 01 documents: **404 identical / 102 differing shared / 108
  reviewed-only / 39 working-only files** compared with reviewed master.
- Main gaps versus reviewed master: credit reports/pricing/allowances, newer usage
  controls/reset, Website Insights, Admin shell/settings and readiness/scheduler
  additions. These were inspected as reference code, not merged or tested here.
- Current local-only fixes and queue/parallel-slot work remain in place. A passing
  build does not mean every unfinished local feature has completed integration.

## Actual Stage 01 baseline checks

The installed Node executable is outside this workspace's default PATH, so checks
used its explicit local executable through a temporary audit runner. Commands
below show their normal project-root equivalents. Test environments withheld live
database/provider/webhook settings. No test was pointed at the configured Neon URL.

| Check | Actual result | Boundary / qualification |
| --- | --- | --- |
| `npm run setup:preview` | Pass | Existing Python 3.13 environment reused in preview; no installs or environment writes |
| Node/Next/React inventory | 22.22.2 / 16.3.3 / 19.2.8 | Current installed packages, not a fresh reinstall |
| `.venv\Scripts\python.exe --version` | Python 3.13.17 | Existing environment |
| `.venv\Scripts\python.exe -m pip check` | Pass: no broken requirements | No package installation |
| `node --test --test-reporter=spec "tests/*.test.mjs"` | **257 passed, 0 failed** | Synthetic/unit tests, including setup preservation, request/model/configuration/cost formatting and client startup loader |
| Scoped JS suites below | **158 passed, 0 failed, 1 skipped** | Mocked API/integration/permission coverage; queue SQL opt-in skipped |
| `.venv\Scripts\python.exe -m unittest discover -s chatkit_backend/tests -q` | **160 discovered: 159 passed, 1 skipped** | Mocked client/preview/provider/security/source/cost tests; PostgreSQL search opt-in skipped |
| `npm run lint` equivalent | Pass | Existing configured app/components/config/lib/scripts/Next/proxy lint scope |
| `node tests/client-ai-ui/startup.mjs` | Pass | Real React component with mocked API/ChatKit transport: startup, three refreshes without Reconnect, client switching, transient retry, denial, online recovery; zero external requests/browser errors |
| `npm run build` equivalent | Pass: optimized Turbopack build | Inactive current checkout; synthetic secrets/unreachable loopback DB/backend; all current routes compiled; no production deployment |
| Database integration tests | Not run; two opt-in tests skipped above | No approved disposable/staging database |
| `npm run setup:check` | Not run | Its inspected implementation performs schema reads against `DATABASE_URL`; current remote target is not designated staging, and no DB contact was needed for this inventory |
| `npm run setup` | Not needed / not run | Dependencies and build already work; avoid reinstalling or changing the baseline |
| `npm run dev` | Not started | Would start services and the explicit-index worker against the configured database |
| Live/staging checks | Not run | No sign-in, consent, model request, Make execution, real message, payment, provider refresh or Vercel deployment |

Scoped JavaScript command:

```powershell
node --conditions=react-server --experimental-test-module-mocks --import ./tests/internal-user/aliases.mjs --test --test-reporter=spec "tests/internal-user/*.test.mjs" "tests/client-hubstaff-api/*.test.mjs" "tests/chatkit-api/*.test.mjs" "tests/admin-index-api/*.test.mjs" "tests/drive-sources/*.test.mjs" "tests/hubstaff-api/*.test.mjs" "tests/hubstaff-index/*.test.mjs"
```

Total unit/scoped/Python result: **574 passed, 2 skipped, 0 failed**, plus the
separate Chrome scenario, lint, setup preview, dependency check and build.

### Existing warnings and unverified evidence

- Python tests log an existing `AsyncMock` transaction coroutine warning and
  `Client cost ledger recording failed: TypeError` from synthetic accounting
  fixtures. The process exits successfully; this is not proof that real database
  cost writes succeeded. The warning was recorded, not repaired in Stage 01.
- Node module mocking emits its normal experimental-feature warning.
- No new failure was introduced or repaired in this documentation-only stage.
  Code inspection gaps and skipped integrations are not silently counted as passes.
- Internal/credit/Website Insights staging browser/SQL behavior was not tested.
  The current checkout lacks the latter two feature suites from reviewed master.
- Build output deliberately uses validation configuration. Do not deploy this
  generated output as evidence of working live credentials or settings.

## Pending setup, with private locations

The current database setting is present and classifies as remote Neon. Its role
is **unverified**, with no dedicated/approved test database. No address or secret
value is recorded here. See the detailed name/runtime table in CONTEXT section 11.

| Pending requirement | Names / owner action | Blocks |
| --- | --- | --- |
| Safe SQL target | Owner designates disposable/local PostgreSQL or approved Neon staging; configure the intended private `DATABASE_URL`/suite-specific test URL | All migrations, DB fixtures, provisioning, job writes and reporting reconciliation tests |
| Drive setup | Privately restore `GOOGLE_DRIVE_CLIENT_SECRET`, original `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`, approved `GOOGLE_DRIVE_ROOT_FOLDER_ID` in root `.env.local` and applicable Next.js/Vercel environment | Named Drive connection, source sync and approved-source live check |
| Scheduled source/index authentication | Set `SOURCE_SYNC_SECRET` and `HUBSTAFF_INDEX_SYNC_SECRET` privately in Next.js plus approved scheduler; code's alternative `CRON_SECRET` is also absent | Authenticated cron/job verification |
| Optional local job opt-in | `LOCAL_SOURCE_SYNC`, `LOCAL_HUBSTAFF_INDEX_SYNC` absent; enable only after target selection | Automatic source worker / existing-index upkeep; explicit queued index jobs can already run on dev startup |
| Optional protected remote Python deployment | `CHATKIT_VERCEL_PROTECTION_BYPASS` absent; configure privately on Next.js only if the intended remote backend requires it | That protected deployment check, not the configured local backend |
| Optional defaults/diagnostics | Absent: `DATABASE_POOL_MAX`, `CHATKIT_UPLOADS_ENABLED`, `OPENAI_DECISIONS_ROUTING`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME`, `DEBUGGER_DEVELOPERS`, `DEBUGGER_MAX_RECORDS`, `DEBUGGER_CAPTURE_BODIES`, `DEBUGGER_BODY_PATHS` | Not blanket startup blockers; defaults and scopes documented in CONTEXT |

Effective flags checked privately: uploads and Decisions routing default true;
debugger and the two local optional worker/upkeep flags are false. Do not confuse
an absent optional name with a missing mandatory secret. Environment OpenRouter
fallback is absent; DB-managed providers may still be configured and were not read.

No new variables or placeholders were introduced. No sign-in was requested:
Stage 01 has no named live provider operation. For an authorized future live
check, ask the owner to perform the specific Google/Hubstaff consent or deployment
sign-in that is actually required; do not request credentials in chat.

## Stage 01 acceptance record (historical)

- [x] Read required local instructions, stack/setup/portability documents and code.
- [x] Identify branch, current commit, local edits and configured database class
  before documentation/test-artifact writes.
- [x] Compare current worktree with the reviewed commit without modifying branches.
- [x] Inventory all 18 page entries, 53 route files and four Python HTTP interfaces.
- [x] Record client/Admin/Internal boundaries and sensitive shared resources.
- [x] Inventory tenant persistence, AI/Drive settings, Make test, Hubstaff/source
  jobs, audits, cost ledger and reviewed-master credit-report reuse/gaps.
- [x] Report baseline build/tests accurately and record pre-existing warnings.
- [x] Record missing names, private setup locations, mocked/unverified checks and
  safe-target prerequisites without displaying configuration values.
- [x] Preserve application behavior and existing local work; only the three
  Stage 01 source documentation files are added.
- [x] Stop at Stage 01; no automatic next stage.

## Stage 02A changes and files

Documentation updated in the same verified checkout, still `master` at
`786b3b56468ffda6c1561c21894bb928e15e41d0`:

- `DECISIONS.md`: proposed AOC software/customer-data/branding ownership rules;
  three independent package scopes, fee classes and support/delivery contacts;
  separate entitlement/assignment/access contracts; conceptual feature switches;
  scoped shared AI knowledge; approved/audited AOC support; reviewed Credits,
  Website Insights and usage/reset consequences; branch recommendation and open
  approval gates. No HR/payroll/recruitment expansion or personnel sharing.
- `CONTEXT.md`: explicit current-versus-proposed boundaries, Harbor Agency (A)
  and Summit Agency (B) permission examples, shared knowledge visibility,
  support-grant walkthrough, reference-only configuration gaps and deferred checks.
- `PROGRESS.md`: this stage register, results and stop gate. Stage 01 checks above
  remain historical evidence, not newly run Stage 02 tests.

The reference was compared read-only in the existing other local repository:
current HEAD is two commits behind (`f3bdb19`, `916bbf5`), with 198 committed paths
changed. The separate Stage 01 dirty-worktree counts are preserved above. Recommend
later **`feat/agency-platform-isolation` from
`916bbf5b781ea0dd7b3b685d5517694dad4185a7`**, if the repository owner confirms that
reviewed commit as the intended build baseline. No branch was created/switched;
neither checkout was merged/reset and no environment was copied.

### Stage 02A actual validation and limitations

- Re-read AGENTS and the three Stage 01 records; inspected client/Admin guards,
  source-audience queries and audit constraints. Re-read reviewed Credits,
  Website Insights and usage-reset code/docs; checked only private configuration
  presence for reference-only names. No database/provider was contacted.
- Before edits, verified all **545 existing source-file hashes** and private
  `.env.local` against the Stage 01 snapshot; branch/HEAD and remote-Neon target
  classification were unchanged. Saved an ignored Stage 02A preservation snapshot.
- Final checks passed: all **545 pre-existing source files** and private
  `.env.local` unchanged; only the three agency-platform documents updated;
  branch/HEAD/Git status unchanged; no unexpected nonignored files. Nine local
  Markdown links/anchors, code-fence balance, credential-pattern screening and
  required-topic consistency checks passed. These are documentation/preservation
  checks, not application authorization tests. Ignored evidence is under
  `.tmp/agency-stage02a/`; portable results are recorded here.
- No application build, lint or application test suite was re-run: only these
  Markdown records changed. Stage 01 remains **574 passed, 2 skipped, 0 failed**,
  with its build/lint/browser qualifications and existing Python mock warnings.
- Fictional permission tables are manual design walkthroughs. They are not
  executable fixtures, mocked authorization passes or evidence of current agency
  isolation/support consent. No runtime feature, schema, fee or brand was enabled.

### Stage 02A pending setup and approvals

The configured remote Neon database remains unapproved for tests. Carry forward
the Hubstaff queue and Python Hubstaff search SQL skips, plus deferred
`setup:check`, migrations, provisioning, ledger/reporting and reference-only
Credits/reset/Website Insights database checks. TEMP/rollback tests are not an
exception to the safe-target requirement. Do not start dev workers on that target.

The private setup table above and CONTEXT §11 remain applicable. CONTEXT §15 adds
four absent reviewed-template names: `WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID`,
`WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET`, `WEBSITE_INSIGHTS_ENCRYPTION_KEY` and
`PAGESPEED_INSIGHTS_API_KEY`. They are optional feature-specific Next.js settings
with documented fallbacks, not Stage 02 startup blockers. Set needed values only
in the selected checkout's private `.env.local`/matching Vercel web environment.
Restore original encryption keys when ciphertext exists. No template placeholders
or secret values were added, copied or printed.

No sign-in/consent was required or requested. Brand, final package inclusions,
commercial terms and support obligations remain draft; no leadership answer is
needed to finish this internal documentation. Record the authorized owners'
decisions before publication/contracting. Baseline confirmation and safe database
selection are prerequisites to later implementation, not unfinished Stage 02 work.

### Stage 02 acceptance record

- [x] Separate AOC ownership, Whitecap people services, proposed Agency Enabled
  branding, customer-data rights and approval-dependent deliverable terms.
- [x] Platform-only, specialist-only without portal accounts, and explicitly
  combined offers are valid; fees and support/delivery responsibilities differ.
- [x] Software access, staffing assignment and customer-data grants are distinct;
  scoped assignments/onboarding do not expose Internal HR or personnel records.
- [x] Show fictional A1 allow / A2 and B1 deny, independent B access, approved
  support with audit/revocation, and common versus agency/client AI knowledge.
- [x] Mark agency/support controls as proposed and identify existing global
  Admin/source-sharing gaps; account for reviewed Credits/Insights/usage behavior.
- [x] Record draft feature switches, branch recommendation, private setup and
  unapproved commercial/brand decisions without implementing or publishing them.
- [x] Carry skipped database/live checks forward and stop after Stage 02/02A.

## Stage 03 prerequisite review — historical pre-confirmation record

The following review preceded the owner's answers. Its baseline gate is resolved
by the confirmed Stage 03 preparation record below; its database gate remains.

### Reconciled Stage 02 / 02A deliverables

The former combined status row covered two actual deliverables; it did not mean
runtime agency isolation was implemented. The register above now separates them:

| Required prior deliverable | Existing evidence | Review result |
| --- | --- | --- |
| Agency permission and customer-data ownership design | DECISIONS S02A-D01, D03, D05–D06; CONTEXT §14 | Present: ownership versus processing rights, agency/client/action grants, private/common AI audiences, assigned A1 allow, A2/B1 deny, approved/audited support access. Proposed controls are explicitly distinguished from existing global Admin/source behavior. |
| Three independent product offers | DECISIONS S02A-D02 and D04 | Present: platform only, specialist only without required portal accounts, and combined; separate subscription/staffing/optional-service fees and software/person/delivery responsibilities. Branding, prices and obligations remain unapproved. |

No missing Stage 02/02A design deliverable was found that requires schema work to
pause for additional product drafting. The actual remaining implementation gate
is the owner's baseline choice, explicitly requested before editing schema.
Original CONTEXT/DECISIONS and historical Stage 01/02A evidence are preserved.

### Target, safe independent checks and files

- Re-read AGENTS, all three handoff records, portability rules and the relevant
  existing schema, client membership, source, audit/cost and migration paths.
- Current write target is still `C:\Users\MY PC\Desktop\AOC\chatkit`, dirty
  `master` at `786b3b56468ffda6c1561c21894bb928e15e41d0`. Reviewed reference
  `916bbf5b781ea0dd7b3b685d5517694dad4185a7` remains in the other local repository,
  not this checkout's object store. No branch/fetch/merge/worktree action occurred.
- Requested confirmation of the proposed isolated
  `feat/agency-platform-isolation` branch from `916bbf5`, or use of the current
  checkout instead. The recommendation is not treated as an owner decision.
- Verified all 545 pre-existing source hashes, all three Stage 02A final document
  hashes and private `.env.local` before writing this progress clarification.
  Only `PROGRESS.md` is updated by this prerequisite review; ignored preservation
  evidence is under `.tmp/agency-stage03/`.
- Private configuration classification still shows remote Neon, no approval as
  staging/disposable, and no populated dedicated test-database setting. Asked
  whether an approved disposable target is available; no connection was made.
- No `psql`, `postgres`, `initdb`, `pg_ctl` or `docker` command was found on PATH,
  and the local PostgreSQL/Docker service lookup reported no matching service.
  This is not proof that no separately installed database exists.
- Source inspection found no RLS/policy setup in the current `database/` SQL or
  standalone migration scripts. Node's shared pool uses `DATABASE_URL`; Python's
  transaction-local setting currently bounds statement timeout, not agency scope.
  Runtime role attributes, table ownership, inherited roles, service credentials
  and owner/BYPASSRLS behavior remain **unverified**. No RLS protection is claimed.
- Preservation/document checks passed: all 545 existing source files and private
  `.env.local` unchanged; CONTEXT/DECISIONS unchanged; branch/HEAD/Git status
  unchanged; only this progress record updated. Code-fence and credential-pattern
  screening passed. These are not database or application security tests.

### Pending setup, acceptance and exact blockers

1. **Baseline confirmation blocks schema/code preparation.** Await the owner's
   answer to the explicit branch/base question; do not edit migrations against
   an assumed baseline or overwrite local fixes. The independent prerequisite
   review is complete, but no Stage 03 migration has been written yet.
2. **No approved disposable database blocks SQL verification/application.** The
   existing private `DATABASE_URL` must not be used for fixtures or migration
   trials. Once a target is selected, configure its connection privately in the
   isolated test process/environment, never in chat or these documents. Migration
   setup and a separate non-owner/non-superuser/non-BYPASSRLS runtime role need
   owner-reviewed privileges; exact role/grant setup must accompany the reviewed
   migration, not a broad production service credential. No new configuration
   variable or placeholder is introduced before the implementation is selected.
3. **Database acceptance remains pending:** additive migration/re-run, two
   fictional agencies rejecting a client/agency mismatch, ordinary-role foreign
   agency SELECT/INSERT/UPDATE/DELETE denial, owner/service-role bypass review,
   and pooled connection scope reset/reuse. None is counted as passed or mocked.
   Carry forward prior Hubstaff search/queue SQL skips and other deferred checks.

No application build, lint or application tests were rerun for this progress-only
change. Historical Stage 01 results remain historical. No schema, runtime helper,
route, provider consent, message, payment or database setting was changed, and no
database connection, provisioning, model request or source job was run.

## Stage 03 prepared implementation — historical preparation record

This section records the initial prepare-only handoff. The owner's later approval
and completed local verification below supersede its pending database status.

The owner answered: **use `feat/agency-platform-isolation` from `916bbf5`** and
**no approved database; prepare migration only**. Stage 02 ownership/permission
design and Stage 02A product offers were rechecked and are both present. No
commercial/brand decision or missing design deliverable blocked this preparation.

### Target and preservation

- Implementation worktree:
  `C:\Users\MY PC\Desktop\AOC\chatkit\.tmp\agency-platform-isolation`.
- Branch: `feat/agency-platform-isolation`; base/HEAD:
  `916bbf5b781ea0dd7b3b685d5517694dad4185a7`. The pinned object was imported from
  the existing other local repository and a new isolated worktree created. No
  remote Git fetch, reset, merge, commit, push or deployment was performed.
- Original root `master` remains at `786b3b5` with its local application edits.
  Only the three handoff records were copied into this worktree; no `.env.local`,
  credentials or local application fixes were copied. The original root progress
  file receives a pointer/status handoff; its CONTEXT/DECISIONS remain preserved.
- No migration or job ran against the original remote Neon setting, and no dev
  process was started. Final checks passed: all 545 original source files,
  private `.env.local` and original CONTEXT/DECISIONS are preserved. Of the 614
  reviewed-baseline files, only `package.json` and `.env.example` changed for
  commands/placeholders; 12 files were added. No app/Internal/Python/dependency
  code was modified. Twenty-nine local Markdown links/anchors, new-file whitespace,
  credential-pattern screening and tracked diff checks passed. Branch/HEAD and
  original worktree status remain as recorded.

### Changes and files

| File(s), relative to the implementation worktree | Prepared change |
| --- | --- |
| `database/agency-platform/000_role_setup.sql` | Separate privileged reviewable owner/runtime group-role setup; no login/password or automatic production provisioning. |
| `database/agency-platform/001_agency_foundation.sql` | Eight new namespace tables: agencies, memberships, client ownership/access, protected login mapping, resource classes, legacy inventory and version ledger. Composite FKs/CHECKs reject mismatched ownership, member grants and accidental global visibility; RLS/grants are scoped to new tables. No legacy table rewrite/backfill. |
| `scripts/migrate-agency-platform.mjs`, `scripts/agency-platform-config.mjs` | Offline plan by default; explicit dedicated target and database-name acknowledgement for application; one transaction/short-lived pg connection, version/checksum/advisory lock and safe error codes. Roles are not auto-applied. |
| `lib/agency-scope.js`, `lib/agency-database.js` | Restricted-role checks, server-context validation and parameterized transaction-local scope on one checked-out shared-pool connection; rollback/reset/discard protections. No route imports. |
| `scripts/check-agency-platform-database.mjs` | Real disposable fixture with Harbor/Summit agencies, assigned/unassigned clients, composite ownership/member rejection, common/private source metadata, foreign DML, forged settings, role/owner/FORCE checks, revocation and reuse after commit/rollback. Explicit empty target and role-fixture acknowledgement; no DATABASE_URL fallback. |
| `tests/agency-platform.test.mjs` | Local mock transaction/error/connection cleanup tests and safe CLI planning/skip/target/error-output checks. No real database. |
| `package.json`, `.env.example` | Four optional plan/test commands and two blank private migration/test URL placeholders; dependencies and lockfile unchanged. |
| `docs/agency-platform/CONTEXT.md`, `DECISIONS.md`, `PROGRESS.md`, `STAGE03_DATABASE.md` | Preserve historical handoff; record confirmed target, additive ownership design, privileged runtime exceptions, setup, actual results, limitations and stop gate. |

### Actual Stage 03 checks

| Check | Actual result / boundary |
| --- | --- |
| `node --test --test-reporter=spec tests/agency-platform.test.mjs` | **9 passed, 0 failed**. Mocks and synthetic URLs, including subprocess CLI plan/skip; no RLS/SQL execution. |
| Focused ESLint on two new lib files, three scripts and the new test | Pass. New files parse/lint; not a whole-application build. |
| Offline migration plan | Pass: explicit CLI invocation printed PLAN ONLY with connection settings cleared/synthetic; no connection or SQL parsing/application. The unit subprocess independently exercises this guard. |
| Default database check | **SKIPPED**: explicit CLI invocation with no dedicated target; legacy DATABASE_URL ignored. The unit test verifies the skip guard; real SQL acceptance is not counted as passed. |
| Migration, constraint mismatch, real RLS/grants/roles/service credentials and pooled PostgreSQL behavior | **Not run**: no approved database. Fixture code is prepared; its SQL and cleanup are unverified. |
| Application build / broad Node/Python suites | Not rerun; existing app/route/backend code and dependencies are unchanged. Historical Stage 01 results are for old dirty master, not certification of this branch. |
| Live provider, message, payment, OAuth, source/job or deployment checks | Not run; none is needed or authorized for offline preparation. |

### Setup and remaining limits

New missing names are **`AGENCY_MIGRATION_DATABASE_URL`** (authorized owner/member
of `aoc_agency_owner`) and **`AGENCY_TEST_DATABASE_URL`** (empty dedicated disposable
DB, authorized owner/CREATEROLE fixture connection). Configure privately in a
separate ignored `.env.agency-test` or test-process environment for this worktree.
Never use production or copy the existing `.env.local`. The example has blank
placeholders only; no real value was generated, copied or printed.

When a disposable target exists, ask its authorized database owner to review/run
the versioned role setup, provision restricted LOGIN roles and approve the exact
target. The fixture also creates temporary-in-purpose cluster roles, so it needs
an isolated disposable database/role environment with unused agency group names.
See [exact setup and commands](STAGE03_DATABASE.md). No sign-in or live consent is
needed now, and no privileged role action was requested against production.

Prepared RLS protects only new namespace tables when restricted login/grant
requirements hold. The owner has an explicit trusted policy exception; actual
service/global credentials and existing legacy policies remain unverified. A
single broad shared login is not a safe agency switch. The new helper is not
authentication; future callers must derive actor/client context server-side.
Central agency connection routing and the existing global Admin/source/legacy
data adoption must be completed before any Stage 11 exposure. Internal Portal,
HR/payroll/recruitment, branding, prices and staffing workflows are unchanged.

### Stage 03 acceptance status

- [x] Confirm baseline and preserve Stage 01/02A deliverables and local edits.
- [x] Prepare additive portable ownership/membership structures, explicit
  global/private classification, constraints, role controls and versioned runner.
- [x] Prepare two-fictional-agency database fixtures and local scope/CLI tests.
- [x] Leave new agency routes structurally unavailable until Stage 11.
- [ ] Apply/rerun on an approved disposable database and verify real constraints.
- [ ] Verify ordinary-role foreign agency read/write denial, owner/service bypass
  attributes and real pooled context cleanup/reuse with the provided fixture.
- [ ] Complete Stage 03 database acceptance; prior skipped DB checks also remain.

## Stage 03 local verification — completed after explicit owner approval

The owner approved creating a **new disposable local PostgreSQL database**, using
Docker if available, while leaving configured Neon untouched. That approval
resolved the prepare-only gate. Work stayed on the existing
`feat/agency-platform-isolation` worktree at `916bbf5`; no Stage 04 work began.

### Local setup and private configuration

Docker and native Windows PostgreSQL were unavailable. Ubuntu WSL was available;
official Ubuntu PostgreSQL **18.3** and required libraries were downloaded and
extracted into a private task directory. No sudo, system package installation,
service registration, global PATH or application environment change was needed.
WSL's volatile `/tmp` could not retain the first extraction, so the cluster used
private persistent WSL storage and a foreground process during checks.

The server was verified as loopback-only before any writes. Two new databases
separated the empty acceptance fixture from standalone migration application.
`AGENCY_MIGRATION_DATABASE_URL` and `AGENCY_TEST_DATABASE_URL` are configured in
the worktree's **ignored `.env.agency-test`**, using generated local credentials.
ACLs restrict the file to the owning Windows account, sandbox account and SYSTEM.
No URL/password was printed, included in Markdown or copied from `.env.local`.
The temporary password file was removed. No Stage 03 local configuration is
missing, and no provider sign-in/consent was required.

### Changes since the preparation handoff

- `scripts/check-agency-platform-database.mjs`: revoke the fixture owner's
  task-created public-schema USAGE grant during cleanup; assert real backend PID
  reuse after commit/rollback and replacement after intentional session pollution.
- `docs/agency-platform/{CONTEXT,DECISIONS,PROGRESS,STAGE03_DATABASE}.md`: record
  approval, actual results, setup, cleanup and remaining deployment limits. The
  original checkout's PROGRESS also receives the completion handoff.
- Ignored only: private `.env.agency-test`, local WSL helper/configuration and
  evidence under the original checkout's `.tmp/agency-stage03-local/`.

No migration SQL, runtime authorization helper, application/Internal/Python code,
dependencies, original local edits or `.env.local` was changed for verification.

### Actual checks and results

| Check | Actual result |
| --- | --- |
| Server/target identity | Pass: new PostgreSQL 18.3, exact generated database/port, loopback-only listener and authenticated task bootstrap user verified before writes. |
| Real acceptance fixture | **9 scenario groups passed**, using only Harbor/Summit fictional agencies and synthetic records. Details below. |
| Prerequisites and role setup | Existing versioned core/client-access schema plus `000_role_setup.sql` applied locally; restricted generated LOGINs successfully exercised. |
| Standalone `migrate-agency-platform.mjs --apply --confirm-database ...` | Pass for first application and identical second run on the separate local migration DB. |
| Independent migration metadata | Pass: one `001_agency_foundation` checksum version, eight tables with ENABLE/FORCE RLS, expected NOLOGIN/non-superuser/non-BYPASS group attributes; original empty client/user/membership tables remain empty. |
| Independent fixture cleanup | Pass before separate migration provisioning: no fixture tables/schema, generated LOGINs or group roles remained. |
| Offline scope/CLI tests | **9 passed, 0 failed**, rerun after the fixture changes. These remain mocked/synthetic and are separate from real SQL results. |
| Focused ESLint | Pass for the two lib files, three scripts and local test file. |
| Shutdown | Task-specific server stopped cleanly; pg_ctl confirmed no server running and the foreground process exited 0. Disposable data/binaries and private configuration retained locally. |

The nine real groups verified:

1. Transactional migration and identical version/checksum rerun.
2. Client/agency mismatch and missing same-agency membership rejected by composite
   foreign keys, even with deliberately broad synthetic legacy memberships.
3. Resource ownership and explicit common-source approval enforced; NULL ownership
   does not grant visibility, and credentials cannot be made common.
4. A1/common metadata reads allowed, A2/B1/private/credential/audit/billing and
   legacy backing-table reads denied; owner-role switching and TRUNCATE denied.
5. Authorized own asset metadata writes allowed; foreign INSERT/UPDATE/DELETE and
   ownership changes denied.
6. Forged agency settings denied; the same PostgreSQL backend PID reused after
   both commit and rollback with cleared settings and zero unscoped visibility.
7. Intentional session-wide pollution rejected/discarded; a different backend PID
   and clean scope served the next authorized request.
8. Both legacy-client and agency membership deactivation immediately denied access.
9. All eight FORCE-RLS flags, explicit trusted-owner visibility, and rejection of
   the privileged bootstrap credential as ordinary scoped runtime.

### Failure found and corrected

The first real run failed cleanup with **2BP01**. PostgreSQL dependency inspection
showed the dedicated owner still held USAGE on `public`. The fixture now revokes
that task-created grant before dropping the roles. Only those leftover roles
were recovered after independently confirming the local fixture schema/tables/
generated logins were absent. The corrected run passed eight existing groups;
the strengthened backend assertions then passed the final **nine-group** run.
No permission boundary or SQL policy was weakened to obtain a pass.

### Preserved scope, remaining limits and evidence

Neon was neither connected to nor written. The original `.env.local` and all
545 original source-file hashes were checked unchanged. Existing route, Internal
Portal and Python behavior stays unchanged; no new route imports the helper.
Final preservation checks passed, including the unchanged migration SQL and
original environment. All 34 local documentation links/anchors, credential-pattern
screening, private-file ACL/ignore checks and tracked diff checks passed. The
only code change since preparation is the acceptance fixture; four worktree
documents and the original progress handoff were updated. Machine-local results
are recorded in `.tmp/agency-stage03-local/verification-results.json` at the
original checkout; this progress record contains the portable results.

The verified scope is the additive namespace on direct local PostgreSQL and the
Node pool. Actual Neon/service roles, external transaction poolers, deployment,
legacy-table agency adoption, full client/Python integration and provider behavior
remain unverified. Trusted owner/superuser credentials are not RLS-protected.
Earlier unrelated Hubstaff queue/search and credit/Website Insights SQL checks
remain separate unrun work; this follow-up does not certify those subsystems.

Local machine-specific evidence is under `.tmp/agency-stage03-local/` in the
original checkout. See [database guide](STAGE03_DATABASE.md) for restart/setup
boundaries. Cluster-level role names mean the fixture must run in a fresh role
environment; the retained migration database now intentionally owns the two
NOLOGIN groups. A different empty database in that same cluster is insufficient
for rerunning the fixture. No required Stage 03 verification remains blocked.

### Current Stage 03 acceptance

- [x] Preserve existing clients/users/memberships and local edits.
- [x] Apply and repeat the additive versioned migration on an approved disposable DB.
- [x] Reject mismatched agency/client and agency/member relationships.
- [x] Enforce ordinary-runtime foreign-agency read/write denial and explicit
  common/private classification, with trusted owner exception verified.
- [x] Verify same-backend clean reuse, rollback and polluted-backend replacement.
- [x] Verify fixture cleanup, private local configuration and server shutdown.
- [x] Keep agency mode unavailable and stop before Stage 04.

## Historical Stage 03 stop point

**Stage 03 local acceptance is complete. Stop before Stage 04.** Do not deploy,
apply to Neon or enable agency mode from this result. Later stages require their
own explicit instructions; new route exposure remains deferred until Stage 11.

## Stage 04 — synthetic local legacy adoption and restore completed

The owner separately authorized this stage in the existing worktree, restarting
the same WSL PostgreSQL 18.3 server and creating fresh disposable databases with
synthetic legacy data only. A second empty database was used for restore. Exact
loopback host/port/database/login identity was verified before writes. No Neon
connection, customer-data snapshot, production migration, real provider call,
payment, message, sign-in or deployment occurred. No Stage 05 work began.

### Changes and preserved scope

| File | Stage 04 change |
| --- | --- |
| `database/agency-platform/002_legacy_adoption.sql` | Additive ownership/catalog/source approvals, deterministic batch state, ownership audit, private/quarantine classification, restricted payload lookup, compatibility predicates and transactional write hooks. Six new FORCE-RLS tables; customer `client_user` role. Version 001 unchanged. |
| `scripts/agency-backfill-plan.mjs` | Manifest validation; all non-Internal legacy relation/PK/FK inventory; source digests; explicit cohort/source classification; sanitized conflicts/quarantine and dry-run counts. |
| `scripts/migrate-agency-backfill.mjs` | Dedicated target/name acknowledgement; READ ONLY dry-run rollback; writer locks, checksum application, AOC adoption, reconciliation and idempotent activation in one transaction. No application DATABASE_URL fallback. |
| `lib/legacy-agency-compat.js` | Uncached activation check and narrow AOC membership/source guards; unmigrated fallback and inactive fail-closed behavior. |
| `lib/portal-data.js` | Apply AOC cohort filter after authenticated legacy membership lookup. |
| `lib/prepared-source-store.js` | Apply ownership predicate before retrieving applicable company/client publication metadata. |
| `tests/agency-backfill/{fixture,plan.test,rehearsal.database.test}.mjs` | Versioned legacy schema setup, synthetic historical data, complete logical snapshots, seven offline cases and eight real database scenario groups. |
| `tests/drive-sources/prepared.test.mjs` | Existing source mocks explicitly distinguish the absent-migration catalog check and retain hot-path assertions. |
| `package.json`, `.env.example` | Backfill/test commands and one new blank dedicated backfill URL placeholder; dependency declarations unchanged. |
| `docs/agency-platform/{CONTEXT,DECISIONS,PROGRESS,STAGE04_REHEARSAL}.md` | Actual results, ownership decisions, ambiguity references, setup, cutover/write/rollback/restore plan and next gate. |

The original checkout receives only a Stage 04 progress pointer/status update;
its existing source edits and private `.env.local` are preserved. No Internal
Portal, Python, route, UI, dependency or framework configuration change was made.
Agency interfaces remain gated until Stage 11. No brand, staffing or subscription
decision was published. Worktree remains on `feat/agency-platform-isolation`
at base HEAD `916bbf5b781ea0dd7b3b685d5517694dad4185a7`; no commit or merge was made.

### Actual verification and evidence

| Check | Actual result |
| --- | --- |
| Inventory | 46 relations / 51 legacy records; reviewed two-client AOC cohort, existing fictional Harbor ownership retained, one unapproved client held. |
| First and second dry runs | Pass: identical sanitized reports, zero conflicts, PostgreSQL READ ONLY confirmed. Complete public/agency table, sequence and trigger snapshots unchanged after each. |
| Backup before apply | Pass: PostgreSQL 18.3 custom-format archive created and access-restricted locally. |
| First apply | Pass: 51 ownership rows; 27 client, 1 AOC agency guidance, 16 platform private, 7 quarantined; one AOC workspace and deterministic batch. |
| Second apply | Pass: 0 ownership changes. Full database state identical after both runs, including audit and sequences; no duplicate records. |
| Legacy preservation | Pass: every legacy table and sequence matches pre-migration fingerprint/count. Client IDs, workspace revision, conversation JSON/items, upload bytes, cleared events, reset archive, pricing versions and historical period pin preserved. |
| Foreign-owner manifest | Pass: intentional foreign-client adoption rejected with a sanitized conflict; apply returns false, and entire database state stays unchanged. |
| Writer freeze | Pass: another connection's legacy write times out while SHARE lock is held; both test transactions rolled back. |
| Agency/private/quarantine reads | Pass: real restricted LOGINs retrieve their own client history; foreign agency/client, other user's conversation, private credential/pricing and quarantined records denied. AOC guidance is unavailable to Harbor. Raw registry/backing-table SELECT denied. |
| Pool reuse | Pass: same PostgreSQL backend after scoped commit/rollback, with cleared selectors and no unscoped agency. Forged foreign scope denied. |
| Existing AOC DAL | Pass: actual SQL for client selection/memberships, workspace, work/general conversation history, AI allowance, credit report with original pricing pin and applicable source lookup. Foreign/unapproved legacy memberships filtered out. Session and Internal guard only are mocked. |
| Writes after activation | Pass: new conversation insert/rename gets atomic ownership/fingerprint updates; delete becomes a quarantine tombstone. Legacy membership deactivation denies scoped access, reactivation restores it. Publisher deactivation immediately excludes guidance. Seeded public history remains identical after flow tests except expected user-session timestamp/sequence activity. |
| Restore rehearsal | Pass: pre-backfill archive restored transactionally into separate empty database; all table rows/counts/triggers and logical sequence values match. Two used sequences have different internal WAL log counters after restore, documented separately from logical identifier state. No Stage 04 activation marker exists in restored pre-backfill copy. |
| Independent role/RLS inspection | Pass: all 14 agency tables ENABLE/FORCE RLS; owner/runtime NOLOGIN groups lack SUPERUSER, BYPASSRLS, CREATEDB and CREATEROLE. Temporary scoped LOGINs cleaned up. Trusted owner/broad legacy app exceptions remain explicit. |
| Real SQL acceptance command | **8 scenario groups passed**, 0 failed (9 TAP tests including parent). Local-only synthetic guards and generated non-owner application credential used. |
| Offline/source/client-role regression command | **29 passed, 0 failed**: 7 backfill cases, 9 Stage 03 scope/CLI cases, 9 prepared-source cases, 4 existing client-permission cases. No real provider calls. |
| Focused ESLint | Pass for changed/new Stage 04 JS, fixtures and adjusted source tests. |
| Default Turbopack build | **Blocked**: worktree root excludes parent installed Next.js package. Build used stripped environment, synthetic auth and unreachable loopback DB. |
| Documented webpack alternative | **Failed compilation**: installed `cheerio`, `robots-parser`, `ipaddr.js` missing for existing Website Insights imports. Already declared at reviewed baseline; no dependency/config changes made here. Full build is not reported passed. |
| Server closeout | Pass: task-specific PostgreSQL stopped cleanly; pg_ctl status confirms stopped and foreground process exited 0. Disposable databases/config/backup retained. |

Initial fixture verification found two test-helper defects: sequence snapshots
attempted whole-row JSON on a sequence (42809), and a runtime test used
`role_name` instead of existing `login_role` (42703). Both helpers were corrected;
final reconciliation and all eight SQL groups passed. The unused task LOGIN from
the failed setup was verified unbound/inactive and removed. No SQL policy,
ownership constraint or runtime isolation rule was weakened. Applied migration
checksums remain intact. See [full runbook](STAGE04_REHEARSAL.md).

Machine-local evidence under original checkout `.tmp/agency-stage04-local/`:
two dry-run reports, apply reports, full before/after snapshots, restored snapshot,
backup, private manifest, local orchestration, isolated build logs and
`verification-results.json`. The Markdown records are the portable handoff;
ignored credentials/archives must not be committed or pasted into chat.

### Pending setup, limitations and production gate

No configuration is missing for this completed local rehearsal.
`AGENCY_BACKFILL_DATABASE_URL` is configured privately in ignored
`.env.agency-test`, alongside unchanged Stage 03 target names. The legacy flow
test's generated `DATABASE_URL` is in ignored `.env.agency-stage04-flows`. These
are local-only, server-side/test-process values with restricted file permissions;
the original `.env.local` was not copied or changed. Only the new backfill name
was added blank to `.env.example`.

Separate browser/application checks need isolated dependency installation and
private worktree `.env.local` configuration: `DATABASE_URL`, `BETTER_AUTH_URL`,
`BETTER_AUTH_SECRET`, `PROVIDER_SETTINGS_SECRET`, `NEXT_PUBLIC_CHATKIT_DOMAIN_KEY`;
remote Next/Python pairing needs `CHATKIT_BACKEND_URL` and matching
`CHATKIT_BACKEND_SECRET`, plus the Python database/provider configuration. No
real provider sign-in was required or requested. Do not supply these in chat.

Actual Better Auth sign-in/browser behavior, Python ChatKit responses, live AI,
Drive consent/decryption, Hubstaff jobs, payments, external poolers, Neon roles,
production-scale timing and cross-cluster role/key recovery remain unverified.
Empty Website Insights/index/job relations were inventoried, not live-tested.
The earlier unrelated skipped database suites remain pending; this rehearsal
does not certify them. The broad legacy app credential and owner/superuser are
trusted exceptions, not agency-RLS-protected request identities.

Future real ownership review must resolve sanitized inventory conflicts privately.
Production migration needs its own approved staging snapshot, restored backup,
writer/provisioning freeze, tested delta replay and final cutover approval. These
are later gates, not blockers that prevent finishing the authorized local stage.

## Historical handoff after Stage 04

**Stage 04 synthetic local rehearsal is complete. Stop before Stage 05.** No
production migration, dependency installation, new agency route or automatic
next-stage work is authorized by this result.

## Primary checkout verification

On November 18, 2026, the 19 implementation files from the handoff were
imported into `AI\portal` through a path-limited Git patch. Local commit
`3ffb6cde5279` on `feat/agency-platform-isolation` contains 15 additions
and 4 modifications on base `916bbf5`. The three SQL files match the source
bytes, including the inputs to migration checksums. The six original handoff
documents accompany the branch. This progress entry supersedes their pre-import
status. The complete file list is in [HANDOFF](HANDOFF.md).

| Check run from the primary checkout | Result |
| --- | --- |
| Focused Node tests | 29 passed, 0 failed, 0 skipped across agency scope/CLI, backfill planning, prepared sources and client permissions. |
| Focused ESLint | Passed on all 15 JavaScript files in the implementation commit. |
| Stage 03 PostgreSQL fixture | All 9 scenarios passed on a fresh loopback PostgreSQL 18.3 cluster. Checks included role privileges, ownership constraints, row visibility, revocation and pooled connection reuse and cleanup. |
| Stage 04 restore and reporting | Restored the saved synthetic pre-backfill archive to a second empty database. Its source digest matched the original rehearsal. Two read-only reports agreed, and table, sequence and trigger snapshots stayed identical after each. |
| Stage 04 migration | First application classified 51 legacy records across 46 relations, with 7 quarantined and 0 conflicts. Every legacy table and sequence matched its pre-application snapshot. Second application changed 0 ownership rows. The full logical database snapshot matched the first application. |
| Stage 04 application and isolation checks | All 8 database scenario groups passed (9 TAP tests including the parent). Real queries exercised AOC client selection, work/general history, credit and source reads, concurrent write exclusion, foreign/quarantine denial, membership revocation and scoped connection cleanup. The session and Internal-user guard were mocked. |

Windows initially returned `ECONNREFUSED` while WSL was starting loopback
forwarding. The run passed after waiting for the local listener. The test used
fresh process-only credentials, and the disposable cluster was stopped and
removed afterward. No focused check remains blocked.

The full Next.js build, browser sign-in, live providers and deployment checks
were outside this focused rerun. The older build failure above belongs to the
source worktree. The source and primary environment files were preserved, Neon
was untouched, and the Git commits are local. Work stopped before Stage 05.


## Stage 05 trusted workspace context

Implemented in the primary checkout on local branch `feat/agency-platform`, created from the verified Stage 03–04 handoff at `9e426a7`. The following results supersede the earlier build and browser status for this checkout.

### Request and support boundaries

- Better Auth verifies the session against its backing store on each protected request. Client authorization intersects enabled client, active legacy client membership, active agency, active agency membership, current ownership and active client assignment. The lower client permission wins. An installation without the agency schema retains existing client membership access. A partially installed agency schema closes the affected routes until the context migration is ready.
- The configured portal host must match, including its port. A URL, header or active-workspace cookie can select an authorized workspace. Conflicts and unknown hosts are rejected. A multi-workspace user chooses before a client page loads. The same-origin selection endpoint verifies and saves the agency and client in HttpOnly cookies. Switching loads a new document. Hubstaff and decrypted source data caches have separate workspace keys.
- Platform operator status comes from an active database record. Global provider configuration uses this authority. Broad legacy Admin queries require an all-AOC client estate. They deny access when a foreign or unowned client exists. Replacing those queries with resource-scoped operations remains future work. Staff can read their own agency context without a client grant. Client access requires an assignment. Internal account exclusion and Internal panel policy continue to apply. Public `/agency` and `/api/agency` routes remain gated until Stage 11.
- The only support action is `support.workspace.status.read`. It returns a portal-enabled flag for one client. A trusted operator records a reason, ticket, named support actor, independent approvals from an agency admin and client admin, and expiry within one hour. Each exercise rechecks the actor, both approvers, resource, grant and time. The database logs issuance, exercise, denial and revocation. The application login cannot read or issue the grants directly. Leadership approval of live consent procedures, retention and any emergency access remains pending. No support UI or live grant was enabled.
- The application derives the actor ID from Better Auth before calling the restricted PostgreSQL functions. Those functions trust the designated application login for the actor argument. A stolen database credential is outside that guarantee. Stage 03's separate role-bound RLS checks cover the scoped agency tables. The legacy application login still has its Stage 04 permissions on legacy tables.

### Files

| Area | Changed paths |
| --- | --- |
| Schema and migration | `database/agency-platform/003_request_context.sql`, `scripts/migrate-agency-context.mjs`, `package.json` |
| Authentication and authorization | `lib/auth.js`, `lib/portal-data.js`, `lib/admin-data.js`, `lib/client-permissions.js`, `lib/workspace-selection.js`, `lib/workspace-schema.js`, `proxy.js`, `app/api/admin/provider-settings/route.js` |
| Client selection | `app/page.js`, `app/credits/page.js`, `app/api/session/client/route.js`, `components/portal/workspace-chooser.js`, `components/portal/account-controls.js` |
| Workspace caches | `lib/workspace-cache.js`, `lib/hubstaff.js`, `lib/prepared-source-context.js`, `lib/prepared-source-store.js`, `app/api/chatkit/route.js`, the three project, workflow and task routes under `app/api/hubstaff/` |
| Tests and record | `tests/agency-workspace.test.mjs`, `tests/agency-backfill/{workspace,rehearsal}.database.test.mjs`, `tests/internal-user/access.test.mjs`, `tests/drive-sources/prepared.test.mjs`, `tests/{provider-activation,openrouter-admin}-route.test.mjs`, this progress entry |

### Local verification

| Check | Actual result |
| --- | --- |
| Full top-level Node suite (`npm test` command) | 365 passed, 0 failed, 0 skipped. Provider metadata and writes used test doubles. |
| Focused agency, backfill planning, prepared-source, client-permission and Hubstaff tests | 34 passed, 0 failed, 0 skipped. Includes incomplete-schema denial, concurrent cache lookups and separate decrypted-source reads for two client workspaces. Some tests overlap the top-level suite. |
| Internal account and panel regression suite | 115 passed, 0 failed, 0 skipped. The suite uses mock identities and adapters. |
| Stage 03–04 regression on fresh disposable WSL PostgreSQL 18.3 | Nine Stage 03 database scenarios passed. Two dry runs made no writes and agreed. Stage 04 classified 51 records with 7 quarantined. Repeat application changed 0 ownership rows and preserved the snapshot. All eight Stage 04 application/SQL scenarios passed. This older DAL test mocks the session and Internal guard. |
| Stage 05 migration with synthetic data | Ran migration 003 twice against the same disposable database with the named Stage 04 non-owner application login. Both completed. |
| Stage 05 real authentication and routes | Five scenarios passed (6 TAP tests including the parent). Synthetic users signed in through Better Auth. Checks covered conflicting selections, unknown host, required choice, foreign clients, request-supplied roles, stale cookies after downgrade, membership/agency suspension, revoked sessions, Internal exclusion, separate platform access, support expiry, denial, revocation and audit. |
| Headless Chrome against the production build | One of the five Stage 05 scenarios. Opened a bookmarked client URL, chose Orchid, switched to Birch, refreshed and verified the account and HttpOnly cookies. Both public agency route prefixes returned 404. The chooser, selection endpoint, database and page navigation were real. Unrelated dashboard API calls and external requests were intercepted. |
| Build and lint | Full Next.js 16.3.3 Turbopack production build passed, including TypeScript and static generation. ESLint passed on the changed JavaScript. |

The browser check initially refreshed before the switch had completed. The final check waits for the selection response and the new client's welcome text before refreshing. The local Next.js server was stopped and the temporary WSL cluster was removed. No external sign-in, provider, message, payment, Neon database, deployment or push was used.

### Private setup and next gate

The primary checkout's private `.env.local` contains entries for `DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`. Presence alone was checked. The tests supplied their own loopback values. Before a separately approved staging run, set these three in the Next.js server environment for that target, including the exact authorized host in `BETTER_AUTH_URL`.

`AGENCY_MIGRATION_DATABASE_URL` and `AGENCY_WORKSPACE_TEST_DATABASE_URL` are absent or empty in the primary `.env.local`. This did not block local testing. For another rehearsal, set the migration URL privately in the operator's shell, confirm the disposable database name and pass its Stage 04 application login to `npm run agency:context -- --confirm-database <database> --app-role <login>`. For `npm run test:agency:context`, supply the test-only bootstrap URL and the distinct non-owner `DATABASE_URL` for that same synthetic fixture. Load the Better Auth schema and set a private synthetic auth secret and loopback origin first. `AGENCY_WORKSPACE_BROWSER_CHECK=1` additionally exercises Chrome against a built local server on that origin. Keep the bootstrap and migration credentials outside the application runtime. Neither the rehearsal nor Stage 05 requires new provider credentials.

**Historical handoff after Stage 05.** Stage 06 was subsequently authorized and is recorded below. Production migration, custom domains, live provider flows and deployment remain unverified.


## Stage 06 server entry-point ownership

Worked from `680af5b` in the primary `AI\portal` checkout on `feat/agency-platform`. The starting tree was clean. The [entry-point inventory](STAGE06_ENTRYPOINTS.md) records all 59 Next.js route-handler files, pages/layouts, service and Python routes, searches, pagination, downloads and exports. No server actions were found.

### Changes and reuse

- Reused Stage 05 session, ownership and permission resolution. Stale-document client headers now fail consistently at the client DAL, including reads. Client mutation inputs reject agency, client, owner, user, permission, price and billing overrides. Client-member writes recheck the current agency/client manage grant inside their transaction.
- Next.js ChatKit and upload proxies sign the trusted agency ID and actual Better Auth session ID. Python independently rechecks that session, expiry, user identity, Internal exclusion, active client membership, role and agency/client assignment. Signed builder preview also enforces the existing platform and all-AOC restrictions before accessing drafts, quotas, providers or files. Existing clients before agency adoption continue through their live membership check. Partial agency setup denies access.
- Reused the existing client/user predicates in conversation, library, generated file, Website Insights, credits and audit paths. Tests exercise actual files, lists, foreign IDs, pagination scope and JSON/CSV exports. Role-specific fields and protected administrator checks remain server-side.
- Hubstaff service batches select adopted AOC ownership before pagination and recheck ownership when queueing or applying pages. Existing saved project mapping, lease, backoff and request limits remain in use. Shared Drive guidance keeps its Stage 04 publisher/agency binding and fresh metadata checks.
- Reused the Stage 04 membership/ownership triggers. The initial review suspected a missing membership synchronization step; inspecting the trigger and exercising actual account creation showed that it was already implemented.
- Added checksum-tracked migration 004 for newly provisioned legacy AOC clients. Its single privileged function verifies the active platform operator, active AOC agency, transaction-time client creation and all other clients' AOC ownership. The runtime transaction creates the client, adopts its ownership, lets the existing trigger classify it, creates its administrator and writes audit entries. Any failure rolls back those database writes. Existing ambiguous records require the reviewed migration process. The dedicated owner retains SELECT/TRIGGER permissions on legacy tables. Migrations 001–003 were preserved.

### Files

| Area | Paths |
| --- | --- |
| Authorization and input | `lib/portal-data.js`, `lib/client-members.js`, `lib/client-library.js`, `lib/client-mutation.js`, `app/api/client/website-insights/route.js` |
| Signed backend | `app/api/chatkit/route.js`, `app/api/chatkit/upload/route.js`, `app/api/builder/preview/route.js`, `chatkit_backend/app.py`, `chatkit_backend/preview.py`, `chatkit_backend/workspace_access.py` |
| Worker and provisioning | `lib/hubstaff-search-sync.js`, `lib/admin-data.js`, `database/agency-platform/004_entrypoint_guards.sql`, `scripts/migrate-agency-entrypoints.mjs`, `package.json` |
| Tests | `tests/agency-backfill/entrypoints.database.test.mjs`, `chatkit_backend/tests/test_stage06_database.py`, `chatkit_backend/tests/test_request_safeguards.py`, `tests/website-insights-route.test.mjs`, `tests/hubstaff-index/{chat-routing,scheduler}.test.mjs` |
| Documentation | This progress record and `docs/agency-platform/STAGE06_ENTRYPOINTS.md` |

### Verification and actual results

| Check | Result |
| --- | --- |
| Full top-level Node suite | 365 passed, 0 failed, 0 skipped. |
| Focused agency/backfill, permissions, prepared guidance and Hubstaff API suite | 34 passed, 0 failed, 0 skipped. |
| Extended source and Hubstaff index suites | 40 passed, 0 failed, 0 skipped. |
| Internal identity, role and panel regression suite | 115 passed, 0 failed, 0 skipped. Internal application code and policy were preserved. |
| Python unit discovery | 176 tests, 172 passed and 4 skipped. Three opt-in Stage 06 database tests run separately below. The existing opt-in Hubstaff search database suite was skipped. Provider responses use fixtures. |
| Stage 03/04 disposable PostgreSQL regression | Stage 03's 9 real scenarios passed. Two read-only Stage 04 reports agreed without changing snapshots. First adoption classified 51 records with 7 quarantined. Repeat changed 0 ownership rows. Eight Stage 04 application/SQL groups passed. |
| Migration 004 | Applied twice on fresh loopback WSL PostgreSQL 18.3 with the designated non-owner runtime login. Both completed. Existing IDs/history were checked before the Stage 06 synthetic mutations. |
| Stage 05 real-session regression | Four scenario groups passed (5 TAP tests). This run omitted the optional browser scenario. |
| Stage 06 real database and routes | Nine scenarios passed (10 TAP tests), using four synthetic identities assigned to two clients in each of AOC and fictional Harbor. Covers denied foreign workspace selectors, denied same-agency unassigned clients, platform/Internal denial, exact list/file/report scopes, JSON/CSV downloads, foreign delete/rename/member mutations, ownership/billing/role overrides, signed proxy fields, role differences, account creation, stale client hints, worker selection and atomic new AOC ownership. |
| Python service against that database | All 3 opt-in tests passed through the Node fixture. Real signed ASGI requests verify signature/payload rejection, scoped thread/item reads and deletion denial. Real SQL verifies active ownership, roles, revoked session IDs and Internal exclusion. The backend connected as the non-owner runtime login; fixture-only Internal account writes used the disposable bootstrap role. |
| Full build and lint | Next.js 16.3.3 Turbopack production build passed. ESLint passed on changed JavaScript, including the extended tests. |

The broader Hubstaff suite exposed an existing mock missing Stage 05's workspace-cache wrapper. It was updated. Scheduler assertions now find the batching query after its ownership check. Other initial failures involved new fixture expectations, Windows' default async event loop, and the test library name (`httpx2` is installed). These were corrected and the final runs above passed. A provisioning rehearsal also caught the dedicated owner's lack of UPDATE privileges; the runtime now re-saves its own new client in the same transaction.

The tests called real route handlers and PostgreSQL queries with actual Better Auth cookies. Next.js ChatKit's upstream response was an explicit fixture so its signed envelope could be inspected. Python used its ASGI application and real database with no provider generation. Worker checks used real selection SQL with aborted execution and a network-denying fixture. Existing Internal, source and provider unit suites retain their mocks. The Stage 06 browser UI was not exercised; the Stage 05 browser result remains the prior evidence.

### Private configuration and limits

No new production secret is required. `DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` remain server-only existing settings. The configured Neon URL was excluded from all test processes.

`AGENCY_MIGRATION_DATABASE_URL` and `AGENCY_WORKSPACE_TEST_DATABASE_URL` remain absent/empty in the primary private environment file. Generated credentials were supplied only through the private test process environment. For another approved rehearsal, set these URLs privately in the test shell, with `DATABASE_URL` pointing to the same disposable fixture as its distinct non-owner application login. Initialize the Stage 03/04 fixture and Better Auth schema, then apply migration 003 followed by `npm run agency:entrypoints -- --confirm-database <database> --app-role <login>`. Run `npm run test:agency:entrypoints` with a synthetic auth secret and loopback origin. The test creates synthetic accounts and business records. It must use its approved fixture. `STAGE06_PYTHON` can select the local Python 3.13 executable when the default `.venv/Scripts/python.exe` is unsuitable.

Apply migration 004 and deploy matching Next.js/Python signed-envelope support only as part of a separately approved deployment. External providers, live Hubstaff/Drive/Make, payments, real messages, production role configuration and production migration remain unverified. The legacy application credential retains direct legacy table privileges. This stage provides application authorization and preserves the separate Stage 03 agency-table RLS design.

Public agency routes remain gated until Stage 11. Harbor's own client portal stays gated too; the matrix verifies foreign denial and positive existing AOC flows. Broad legacy Admin operations remain unavailable in a foreign or ambiguous estate. Provider control retains its narrow platform guard.

The disposable WSL cluster was stopped and removed after verification. **Stop before Stage 07.** No push, production write or next-stage work was performed.
