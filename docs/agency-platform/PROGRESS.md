# Agency Platform progress

> Current primary checkout is `C:\Users\MY PC\Desktop\AI\portal` on `feat/agency-platform`. Stage 13A specialist assignments are locally verified; external access stays gated. [Stage 13A handoff](#stage-13a--scoped-specialist-assignments)

Updated November 19, 2026, Asia/Shanghai.

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
| Stage 07 — private files and cached content | Implemented and verified locally | Authenticated delivery, copied-link/revocation checks, upload expiry and workspace cache isolation. |
| Stage 08 — agency AI retrieval and approved revisions | Implemented and verified locally | Scoped source revision adoption, canary retrieval, source/tool/stream revocation checks. |
| Stage 09 — business connection ownership | Implemented and verified locally | Explicit Google ownership, callback/refresh generation checks, Make connection-test restrictions and secret-rotation plan. |
| Stage 10 — background jobs | Implemented and locally verified | Ownership/version fences, leases/retries/fair scheduling; deployment scheduler check pending. |
| Stage 11 — isolation evidence | Local engineering PASS; external rollout HOLD | Runtime-role guards and four-client DB/browser matrix; hosted AI/CDN/deployment checks remain. |
| Stage 12 — platform console | Implemented and locally verified | Explicit platform roles, agency lifecycle/audit, AOC delivery and status-only dual-consent support. |
| Stage 13 — agency administration | Implemented and locally verified | Two-agency client/staff/settings/usage/audit, ownership and local consent; closed external gate. |
| Stage 13A — specialist assignments | Implemented and locally verified | Separate engagements, agency approval, action/client/file/expiry scope, replacement/revocation and HR exclusion; external hold. |
| Stage 14 onward | Not started | Requires a separately supplied task; external gate remains closed. |

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


## Stage 07 private files and cached content

Built on `1b5f02d` on `feat/agency-platform` in the primary `AI\portal` checkout. The starting tree was clean. Read AGENTS, the Stage 06 handoff, CONTEXT, DECISIONS, database portability and the installed Next.js data-security guidance.

### Implementation and delivery contract

- Reused Stage 05–06 live session, agency ownership, client assignment and role checks. Existing PostgreSQL library, upload and generated-file stores retain their client foreign keys. Composer uploads, generated files and conversations additionally retain their private user keys. The globally unique client ID maps to one agency through the ownership registry. No storage provider or schema change was needed.
- Private library and generated downloads now share `lib/private-download.js`. Both routes authenticate before querying bytes and send attachment disposition, sanitized basename, private/no-store, Vary Cookie, no-referrer, nosniff and sandbox CSP headers. Plain HTML or code references remain download attachments. No private storage directory or public object bucket is introduced.
- Download URLs are authenticated resource identifiers. Each request requires the current session and current workspace permission. There is no bearer grant embedded in those URLs, so there is no post-revocation bearer-grant expiry window. The next authorized request after committed membership loss fails, even when the same session previously downloaded the file or warmed a server cache. A request already authorized and streaming, or bytes previously downloaded or rendered, cannot be recalled.
- Existing time windows remain explicit. Unattached ChatKit uploads expire from retrieval after 24 hours. Attached uploads follow their conversation lifetime and scoped access. Staff preview artifacts can be read for 24 hours from creation by their active authorized owner and within the restricted AOC Admin estate. That age limit does not grant anonymous access. Client generated files and library references remain available for their record lifetime while current access permits them.
- The signed Next.js-to-Python request has the existing 60-second timestamp tolerance. It is a private service credential mechanism. Python still rechecks the live session and membership before each request. No browser receives this signature.
- Library requests now send the rendered client ID. A tab whose workspace cookie changed receives the existing stale-workspace error. The existing explicit workspace switch replaces the whole document, discarding React/ChatKit conversation state and router caches. Hubstaff cache keys include the verified agency/client/user/role key. Decrypted source caches also include client, publisher, revision and encryption-key binding and revalidate fresh authorization metadata before reuse. Deduplication for saved uploads is constrained by client and upload ID. Generated artifacts and raw uploads receive random IDs.
- The asset review found the repository-owned `aoc-logo.png` and `aoc-icon.png` branding imports. There is no `public` upload directory or service worker serving private bytes. Their static image delivery confers no access to the authenticated file routes. Client persistent browser storage contains layout preferences. The debugger stores its tab identifier separately. Existing Internal-local planning data belongs to its separate Internal workflow and was not migrated into client storage.

### Files

`lib/private-download.js`; the two file routes under `app/api/client-library/[id]` and `app/api/assistant-files/[id]`; `lib/portal-data.js`; `lib/builder-data.js`; `components/ai-assistant/chatkit-assistant.js`; `tests/private-download.test.mjs`; `tests/agency-backfill/entrypoints.database.test.mjs`; `chatkit_backend/tests/test_stage06_database.py`; this progress record.

### Actual verification

| Check | Result |
| --- | --- |
| Top-level Node suite | 366 passed, 0 failed, 0 skipped. Includes traversal/header injection filename cases, attachment disposition, sandbox and private cache headers. |
| Focused agency, permissions, Hubstaff and prepared-source tests | 34 passed. Existing warm source-cache tests recheck revocation/failure metadata and isolate client reads. Concurrent cache tests keep identical provider keys separate by workspace. |
| Python discovery | 177 tests, 172 passed and 5 skipped. Four opt-in tests are run against the real database below. The existing Hubstaff database suite remained skipped. |
| Disposable WSL PostgreSQL | PostgreSQL 18.3 on loopback with generated process-only credentials. Stage 03’s 9 scenarios, Stage 04’s two no-write reports and two applies, and Stage 05’s four session/support scenarios passed. Migrations 003 and 004 each ran twice. |
| Extended entry-point/database fixture | 10 scenarios passed (11 TAP tests including the parent). Contains Stage 06’s real-session routes plus Stage 07 copied anonymous/foreign links, switched workspace, same-client shared-library versus private generated artifact, revoked membership after warm cache, private response headers and preview age expiry. |
| Python signed ASGI plus real PostgreSQL | All 4 tests passed inside the fixture. Upload tests save duplicate synthetic bytes as distinct IDs, reject access by another client and by another user in the same client, expire an unattached upload after 25 hours, reject traversal names and deny signed upload after membership loss. Existing signed history/cursor/delete tests passed too. |
| Build and lint | Full Next.js 16.3.3 Turbopack production build passed. ESLint passed on changed JavaScript. |

Tests used actual Better Auth cookies, real route functions and database queries. The upstream Next.js ChatKit response and external provider dependencies used labeled fixtures. The warmed-cache scenario used the actual workspace key helper with a test-owned memory cache, while prepared-source tests exercised their production cache with mocked metadata. No CDN request, browser account switch or live provider flow was run in Stage 07. **Stage 06 browser verification remains pending.** Stage 05’s prior browser result is retained as historical evidence.

### Setup, revocation limits and next gate

No additional configuration or storage credential is required. Existing private `DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` were replaced in test processes with synthetic loopback settings. Neon was untouched. `AGENCY_MIGRATION_DATABASE_URL` and `AGENCY_WORKSPACE_TEST_DATABASE_URL` remain absent/empty in the project environment file. For a repeat, supply them privately in the approved test shell along with the separate same-database runtime `DATABASE_URL`, synthetic auth settings and Python executable if needed. Reuse `npm run test:agency:entrypoints` after preparing the disposable Stage 03–06 fixture. No environment file was copied or changed.

Browser back/forward cache behavior, already-open tabs displaying bytes fetched earlier, real CDN header propagation and deployed revocation latency remain unverified. Private no-store responses and document replacement cover subsequent application delivery. They cannot erase a recipient’s saved files or previously rendered content.

Stage 11 gating and legacy Admin restrictions remain active. The WSL cluster was stopped and removed after testing. **Stop before Stage 08.** Production migration, deployment and push require their separate workflow.


## Stage 08 agency AI retrieval and approved revisions

Built on `570bc51` in the primary `AI\portal` checkout on `feat/agency-platform`. The starting working tree was clean. Read AGENTS, CONTEXT, DECISIONS, the Stage 07 handoff, database portability and installed Next.js data-security guidance.

### Isolation and revision behavior

- Migration 005 adds a protected revision-approval table alongside Stage 04's existing ownership-approval table. It adopts only enabled publications already classified by the reviewed ownership registry, with an existing source connection, binding and corpus revision. Unresolved ownership and missing revision metadata confer no retrieval access. Existing migrations 001–004 are preserved.
- The former shared company pack has an explicit AOC agency binding. Retrieval exposes its effective audience as `agency:<id>` and checks the selected client's current agency ownership. Another subscribing agency receives none of that guidance automatically. The legacy database label `clients` remains as a compatibility key for existing publications, UI and the Stage 04 registry. It no longer denotes universal retrieval access.
- Client extras require their exact client and agency. Private Admin guidance requires its owner. The private Admin assistant can retain AOC agency guidance through the established platform operation. Public agency routes remain gated until Stage 11.
- Approval pins the publication settings, corpus revision and connection binding/configuration. Retrieval rechecks active publisher, agency, client ownership, enabled state, connection identity, freshness and current approval on every call, including warm-cache calls. New corpus or instruction changes fail closed. The synchronization cache may retain a changed draft corpus, but it is withheld from chat.
- **Stage 20B remains a dependency.** New publication saves/enables are rejected until its approval workflow exists. Disabling remains available. This stage provides no approval UI or runtime permission to issue revision approvals. The migration adopts existing enabled, ownership-reviewed content as the initial baseline. A separately reviewed operator migration is required for deployment.
- Next.js signs source boundary identifiers and approved revisions together with the existing agency/client/user/session context. Python rechecks each boundary against current PostgreSQL state. Source excerpts without their boundaries are denied. The application derives those fields from authenticated context, never from prompt text.
- Function tools recheck live access before invocation and again before returning their result. Stream chunks recheck access before delivery. Revoking a source during a tool call or stream blocks subsequent results/chunks. The trusted project, website and vector-store IDs must still match the initial client configuration. A vector-store ID configured on multiple clients is denied. Hosted tools receive only the server-configured store/domain and retain the stream delivery checks.
- Retrieved task text, website material and attachments remain untrusted request data. Model tool parameters cannot replace the closure's agency/client/user context. Existing source privacy filtering, buffered/sanitized client output, scoped reopened history, uploads and tool queries remain in use. Permitted task/public website evidence and dates remain available. Private source titles, paths, IDs, revisions and Drive links remain covered by the existing client response filters.

### Changed files

| Area | Paths |
| --- | --- |
| Schema and runner | `database/agency-platform/005_source_boundaries.sql`, `scripts/migrate-agency-sources.mjs`, `package.json` |
| Source retrieval | `lib/prepared-source-store.js`, `lib/prepared-source-policy.js`, `lib/prepared-source-context.js`, `app/api/chatkit/route.js` |
| Source settings UI | `components/admin/drive-sources.js`, `components/admin/prepared-source-settings.js`; labels name AOC agency clients and the publish action is disabled pending approval support. |
| Python access and tools | `chatkit_backend/app.py`, `chatkit_backend/assistant.py`, `chatkit_backend/preview.py`, `chatkit_backend/workspace_access.py`, `chatkit_backend/hubstaff_search.py` |
| Fixtures/regressions | `tests/agency-backfill/sources.database.test.mjs`, `tests/agency-backfill/rehearsal.database.test.mjs`, `tests/drive-sources/prepared.test.mjs`, `chatkit_backend/tests/test_stage08_sources_database.py`, `chatkit_backend/tests/test_stage06_database.py`, `chatkit_backend/tests/test_client_stream.py`, `chatkit_backend/tests/test_image_generation.py` |
| Records | This progress entry and DECISIONS S08-D01 |

### Actual results

| Check | Result |
| --- | --- |
| Full Node suite | 366 passed, 0 failed, 0 skipped. |
| Prepared-source and Hubstaff index suites | 40 passed, 0 failed, 0 skipped. Source fixtures explicitly supply approved revision metadata. |
| Python discovery | 180 tests, 172 passed and 8 skipped. Opt-in database tests are exercised separately below. Privacy, reopened history, attachments and model-wire suites retain their fixtures. |
| Stage 03/04 disposable regression | Nine Stage 03 scenarios, identical no-write reports and idempotent Stage 04 applications passed. The updated pre-005 source assertions expect retrieval denial until its migration is installed. |
| Stage 05–07 real database fixtures | Five Stage 05 TAP tests and eleven extended Stage 06/07 TAP tests passed. Signed Python, reopened scoped history, foreign cursors, per-user uploads and membership/project/store changes were exercised with real database access. Five Python database tests ran inside that fixture, including the added context recheck. |
| Stage 08 source fixture | One integrated real-database test passed. Migration 005 ran twice. AOC agency guidance, two distinct AOC client extras, a fictional Harbor client canary and private Admin canary stayed in their permitted audiences. An unknown client retrieved nothing. Changed instruction/corpus revisions and revoked source access blocked retrieval. |
| Stage 08 tool/stream fixture | Two Python tests passed against the disposable database. The actual guarded function tool denied invocation after source withdrawal and withheld a result when access changed during execution. A signed ASGI streaming fixture delivered the permitted first chunk and withheld the next chunk after source revocation. Foreign client context was denied. |
| Build and lint | Full Next.js 16.3.3 Turbopack production build and ESLint on changed JavaScript passed. |

The first migration rehearsal caught a name collision with Stage 04's existing approval table. The new revision table received a separate name. Model-wire fixtures were updated to mock their session recheck explicitly. Source/tool fixtures used the installed Agents SDK ToolContext and isolated legacy publication owners. Final runs passed.

### Fixture and live-test limits

The canaries are synthetic. Prompt-injection strings stayed inside retrieved data and could not change the server's selected workspace. This is authorization and delivery evidence. It is not a live model resistance benchmark. No live AI generation, provider upload, real customer document, Drive consent, Hubstaff request, Make message or payment occurred.

The tool fixture uses a synthetic tool body with actual application guard and real PostgreSQL authorization. The stream fixture uses a synthetic SDK byte stream through the actual signed ASGI endpoint. Existing model-wire tests mock the guard for their synthetic Context objects. Live hosted-vector ownership, provider behavior, streaming performance and deployed revocation latency remain unverified.

Revocation controls subsequent retrieval and delivery. Previously delivered content and material already sent to a provider cannot be recalled. Reopened conversations retain their authorized historical business facts and pass the existing response privacy filters. This stage does not erase prior history or claim a general semantic confidentiality filter.

The immediate checks concern committed portal membership/publication/connection changes and recorded sync failures. A permission revoked directly at Google is discovered by the next source check or by the 15-minute source freshness limit. Cached material may remain eligible during that discovery window. Live provider revocation timing was not exercised.

**Stage 06 browser verification and live CDN checks remain pending.** Browser back/forward cache behavior and Stage 07's remaining delivery checks carry forward. The legacy runtime database credential still has direct legacy-table privileges. Functions trust the server-established actor context. Existing Stage 03 agency-table RLS claims remain limited to its tested runtime roles.

### Private setup and next gate

No new production secret is required. Use the existing private `AGENCY_MIGRATION_DATABASE_URL` with the reviewed database name and runtime login for `npm run agency:sources -- --confirm-database <database> --app-role <login>`. The migration operator needs the existing dedicated-owner membership. Runtime receives only the two source-check functions. The revision table is owner-controlled.

`AGENCY_MIGRATION_DATABASE_URL` and `AGENCY_WORKSPACE_TEST_DATABASE_URL` remain absent/empty in the project environment file. The rehearsal generated their disposable loopback values in its private process environment. To repeat source tests, prepare the synthetic Stage 03–07 fixture, supply those URLs plus the distinct same-database runtime `DATABASE_URL`, synthetic `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` privately in the test shell. Run the source fixture with the existing React-server/alias test flags. The source fixture supplies synthetic Drive configuration internally and runs migration 005 itself. No environment file was copied or edited.

Neon was untouched. The disposable WSL PostgreSQL cluster was stopped and removed. **Stop before Stage 09.** Stage 20B approval workflow, deployment and production migration require their later instructions.


## Stage 09 business connection ownership

Built on 3fb6cf5 in AI\portal on feat/agency-platform. The starting tree was clean. Read AGENTS, CONTEXT, DECISIONS, the Stage 08 handoff, database portability and installed Next.js data-security guidance. The [connection inventory and private setup](STAGE09_CONNECTIONS.md) was recorded before code changes and covers Hubstaff client mappings, independent Internal Hubstaff auth, Drive, Search Console, Make and deployment AI providers.

### Changes and decisions

- Migration 006 pins Drive publishers to AOC and Search Console sites to their current client/agency. The owner-controlled ledger stores resource and generation metadata. Its runtime functions independently verify the live session and applicable role. Unknown or foreign ownership denies access.
- Google PKCE/state protections remain separate between Drive and Search Console. Encrypted state now contains the agency, service, resource and generation. Final credential writes recheck current authorization and expected generation in the same transaction. Local disconnect, reconnect and property changes advance generation. A stale callback or refresh cannot overwrite a replacement or return data read under that old connection.
- Search Console validates provider read access before saving authorization and verifies a matching property through its API before selection. Viewer/report-reading behavior is preserved; managing credentials remains a Client Administrator action.
- Drive background reads check publisher ownership and connection continuity around refresh and reads. Reconnecting invalidates the old Stage 08 connection approval. New knowledge is still held for Stage 20B. Local Drive disconnect replaces automatic Google-wide revocation, which could affect Search Console or another connection using the same OAuth app.
- Reused Internal Hubstaff's identity mapping, encrypted state, connection-version updates and serialized refresh. Client Hubstaff still uses trusted per-client project mappings through the AOC-private integration. The existing project ownership tests remain relevant.
- Make remains a restricted connection test with a fixed payload and server-only destination. Destination validation rejects embedded URL credentials, fragments and nonstandard ports. UI confirmation uses fixed text. Agency workflow actions and inbound delivery remain unavailable. Durable inbound/business-event deduplication remains a future dependency if those actions are enabled.
- Deployment OpenAI/OpenRouter keys stay platform-private. No new agency credential-sharing route or automatic connection inheritance was introduced. Stage 11 gating and the legacy Admin all-AOC estate restriction remain active.

### Files

| Area | Files |
| --- | --- |
| Schema and operator command | database/agency-platform/006_connection_ownership.sql, scripts/migrate-agency-connections.mjs, package.json |
| Connection lifecycle | lib/integration-ownership.js, lib/drive-source-service.js, lib/website-insights/google.js, app/api/admin/source-connections/route.js |
| Make connection test | lib/make-webhook.js, tests/make-connection.test.mjs |
| Controlled and database fixtures | tests/website-insights-google.test.mjs, tests/drive-sources/oauth.test.mjs, tests/drive-sources/sync.test.mjs, tests/agency-backfill/connections.database.test.mjs |
| Records | STAGE09_CONNECTIONS.md, this record and DECISIONS S09-D01 |

### Actual results

| Check | Result |
| --- | --- |
| Full top-level Node suite | 367 passed, 0 failed, 0 skipped. Includes the fixed Make payload, URL restrictions and safe response test. |
| Source and Hubstaff index suites | 40 passed, 0 failed, 0 skipped. Existing Google account/scope, PKCE, replay, revoked-token, folder/revision and project cases passed with explicit ownership metadata fixtures. |
| Internal account, OAuth, role and panel suites | 115 passed, 0 failed, 0 skipped. Internal application code and its existing version-aware credential logic were reused. |
| Disposable WSL PostgreSQL regression | Fresh loopback PostgreSQL 18.3. Stage 03's nine scenarios, Stage 04's two no-write reports/two applies and application checks, Stage 05's five TAP tests, Stage 06/07's eleven extended TAP tests and Stage 08's source/tool/stream fixture passed. |
| Migration 006 | Applied twice to the disposable database with the designated non-owner runtime login. Existing Drive credential rows and the valid Stage 08 source approval were preserved before reconnect tests. |
| Stage 09 real database/Google fixtures | Five scenario groups passed, 6 TAP tests including the parent. Tests cover foreign and same-agency unassigned client callbacks, one-use callback replay, encrypted storage, matching-property selection, disconnect during exchange, stale refresh, duplicate generation commit, role downgrade during exchange, denied direct ledger access, AOC-only Drive, stale Drive callbacks and refreshes, local disconnect and invalidation of source approval after reconnect. |
| Build and lint | Full Next.js 16.3.3 Turbopack production build and ESLint on changed JavaScript passed. |

The tests used actual database rows, session records, application connection functions, transactions and AES-GCM encryption. Google token exchange, identity response and resource reads were mocked. The Make test used a mocked response and sent no real message. Existing Internal provider fixtures and Stage 08 model-wire/stream fixtures remain labeled as fixtures. No live provider sign-in, consent, refresh, AI call or project update occurred.

The initial local failures were a reused synthetic website URL, a source-sync mock missing the new scope queries and a fixture denial-code expectation for Drive replay. These were corrected. Final runs passed.

### Setup, pending checks and next gate

No new encryption secret is required. Existing server-managed secrets and encrypted stores were reused; the inventory includes a coordinated rotation/rollback plan. Managed deployment secrets and live rotation were not changed or verified.

The optional WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID, WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET and WEBSITE_INSIGHTS_ENCRYPTION_KEY entries and AGENCY_MIGRATION_DATABASE_URL / AGENCY_WORKSPACE_TEST_DATABASE_URL are absent/empty in the primary environment file. The Search Console fallbacks remain supported. Existing app, Drive, Hubstaff, Make and provider-encryption entries are present; this was only a presence check.

For an approved repeat, privately set the migration/test URLs and distinct runtime DATABASE_URL for the same disposable fixture, plus synthetic BETTER_AUTH_URL and BETTER_AUTH_SECRET. Apply migration 006 through npm run agency:connections -- --confirm-database <database> --app-role <login>. The fixture needs the earlier synthetic schemas, Better Auth sessions and Stage 08 source fixture. Keep owner credentials outside runtime and out of chat. Stage 09's Google fixtures supply their own test configuration.

Before any future real provider check, ask for the named test account/resources and redirect URLs. The user performs sign-in and consent. Exact setting names and read scopes are listed in STAGE09_CONNECTIONS.md. No production password or API token is needed in chat.

Existing ten-minute Google sign-in attempts from older code should be restarted after deployment because they lack the new encrypted ownership snapshot. Stored grants adopt the ledger without re-encryption. The legacy application credential still has backing-table privileges; this stage does not claim global credential-table RLS.

The Google revocation discovery window remains the next provider/source check or the existing 15-minute freshness bound. Live AI, Stage 06 browser verification, live CDN checks, managed-secret rotation/restore and deployed revocation latency remain pending. Make inbound/business-event verification and deduplication are pending only if a later workflow is authorized; no inbound receiver was added.

Neon and environment files were untouched. No live payment or message was sent. The disposable WSL cluster was stopped and removed. **Stop before Stage 10.** Nothing was pushed.


## Computer-switch handoff after Stage 09

The completed implementation is saved in local commit `48a5043` on `feat/agency-platform`, following Stage 08 commit `3fb6cf5`. The primary checkout is `C:\Users\MY PC\Desktop\AI\portal`. The tree was clean before this documentation checkpoint. Stages 01–09 are complete within the local verification scope recorded above.

### Completed and verified

Connection ownership, Google callback/reconnect/refresh protections and Make connection-test restrictions are implemented. Stage 08 agency knowledge and approved revisions are preserved. Source publishing remains held for Stage 20B. Public agency routes stay gated until Stage 11, and broad legacy Admin operations retain the all-AOC restriction.

The recorded final checks passed with 367 top-level Node tests, 40 source/Hubstaff tests, 115 Internal Portal tests and five real-database OAuth scenario groups (6 TAP tests including the parent). Full production build and focused ESLint passed. The disposable WSL PostgreSQL run also passed the earlier agency, migration, source, tool and stream regression fixtures. Google network responses, Make responses and model-wire behavior used fixtures. These are the completed Stage 09 results, not additional checks run for this documentation-only checkpoint.

### Unfinished work and next step

- Stage 10 has not started. Resume only after reading this record, AGENTS.md, CONTEXT.md, DECISIONS.md and the supplied Stage 10 task.
- Stage 20B still needs publication draft/approval workflow and approved-revision transitions. New knowledge revisions remain withheld until reviewed.
- Live AI and Google/Hubstaff consent, refresh and revocation timing remain unverified. Stage 06 browser verification, live CDN/header checks and browser back/forward cache checks remain pending.
- Managed-secret rotation/restore and production deployment/migration remain pending. Make agency workflows and authenticated, deduplicated inbound business events require later authorization if introduced.
- Google-side revocation retains the documented discovery window of the next provider/source check or the existing 15-minute freshness bound. Previously delivered data cannot be recalled.

### Resume on another computer

Transfer the local Git history through this documentation checkpoint and select `feat/agency-platform`. A remote checkout alone will not contain these unpushed commits. Check the branch, commit and local edits before changing files. Older source-worktree banners in CONTEXT/HANDOFF are historical; the current primary-checkout status is this PROGRESS record.

Configure secrets privately on the receiving computer. No environment file or credential is part of this checkpoint. Keep the original encryption keys with any corresponding encrypted data. A fresh synthetic database may use its own disposable keys. Refer to [STAGE09_CONNECTIONS](STAGE09_CONNECTIONS.md) for connection owners, exact setting names, redirects, consent scopes and rotation steps.

The absent/empty operator-only settings are `AGENCY_MIGRATION_DATABASE_URL` and `AGENCY_WORKSPACE_TEST_DATABASE_URL`. Supply them only in the approved disposable test shell, with a distinct runtime `DATABASE_URL` for that same fixture. Optional `WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID`, `WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET` and `WEBSITE_INSIGHTS_ENCRYPTION_KEY` may use their documented fallbacks. Never put migration-owner credentials in browser or ordinary runtime configuration.

The local PostgreSQL test cluster was stopped and removed. Recreate an approved disposable database and its synthetic fixtures before database tests. The private source-machine `.tmp` runners, test logs, installed dependencies and environment files are excluded from Git. Reuse the versioned migrations, fixture modules and Stage 03/04 runbooks for a fresh setup. The application changes have not been applied to Neon.

Only this progress document is changed by the computer-switch checkpoint. No implementation, environment or temporary file is included. No push, live provider action or Stage 10 work is performed. Work stops here.


## Stage 10 ? Background job ownership and recovery

Completed locally in `C:\Users\MY PC\Desktop\AI\portal` on
`feat/agency-platform`, building on implementation `48a5043` and preserving the
`50c0ee1` handoff. The starting working tree/index were clean. Read AGENTS,
CONTEXT, DECISIONS, prior handoff, database portability, installed Next.js
security guidance and existing job/scheduler code. Prior historical status is
retained above; this entry supersedes the Stage 09 stop marker.

### Changes and reuse

- Migration 007 and `npm run agency:jobs` add explicit agency/client job bindings,
  configuration versions, durable tokens, bounded status and retry counters.
  Protected SECURITY DEFINER functions resolve live resource ownership. They
  reject suspension, foreign ownership, stale sessions, revoked assignments,
  effective Viewer access and changed connections before work or output.
- Reused existing Hubstaff task/comment leases, cursors, generations, upserts,
  persisted queues and provider backoff. Each provider page and transactional
  write rechecks access. Saved project mapping and credential bindings remain
  enforced. Explicit queueing no longer starves older unattempted projects.
- Reused source owner leases, encrypted corpus/revision reuse and fail-closed
  failures. Preparation checks the AOC publisher/connection generation before
  reads and final writes. New prepared bytes do not approve a source revision.
  Source cron is bounded to three owners/90 seconds, at most 85 seconds per owner.
- Reused Website Insights browser batches and report lease-token saves. Starting
  and resuming verify the live permitted client. Crawl requests, result commits
  and delivery are fenced. The existing Resume button requests an explicit
  authorized retry. Reports/exports retain existing client privacy protections.
- Admission allows five active jobs per agency across Hubstaff/source/report
  kinds, serialized across processes. Existing per-resource leases remain in
  charge of results. Automatic failures back off and stop at five; explicit
  authorized retry resets them. User cancellation does not count as failure;
  atomic source/report timeouts do. Expired/replaced tokens cannot save/release
  another worker's lease. No outbound report message or inbound event receiver
  was introduced.
- AOC-only provider ownership, Stage 08 approved-revision/privacy controls,
  separate Internal account policy, legacy Admin restrictions and Stage 11 gate
  remain. New agencies cannot use AOC jobs/connections. Global multi-agency live
  provider throughput is not verified or enabled.

### Files

| Area | Files |
| --- | --- |
| Portable schema/operator | database/agency-platform/007_background_jobs.sql; scripts/migrate-agency-jobs.mjs; package.json |
| Shared execution contract | lib/background-jobs.js |
| Existing workers | lib/hubstaff-search-sync.js; lib/prepared-source-sync.js; lib/website-insights/store.js |
| Existing actions | app/api/admin/hubstaff-index/route.js; app/api/client/website-insights/route.js; components/portal/website-insights.js |
| Fixtures/regression | tests/agency-backfill/jobs.database.test.mjs; tests/agency-backfill/entrypoints.database.test.mjs; tests/hubstaff-index/scheduler.test.mjs; tests/drive-sources/sync.test.mjs |
| Handoff/operations | STAGE10_JOBS.md; CONTEXT.md; DECISIONS S10-D01; this progress entry; docs/HUBSTAFF_SCHEDULER.md |

### Actual results

| Check | Actual result |
| --- | --- |
| Top-level Node suite | 367 passed, 0 failed, 0 skipped |
| Drive/source and Hubstaff index suites | 40 passed, 0 failed, 0 skipped |
| Internal account/OAuth/role/panel suites | 115 passed, 0 failed, 0 skipped; Internal application code unchanged |
| Full production build | Next.js 16.3.3 Turbopack passed with private environment values shadowed and synthetic unreachable loopback targets |
| Migration 007 | Applied twice successfully on fresh disposable WSL PostgreSQL 18.3 using separate operator and ordinary runtime logins |
| Stage 10 database acceptance | Eight scenario groups passed, 9 TAP tests including the parent, 0 failed/skipped |
| Earlier local regressions | Stage 03 nine real PostgreSQL scenarios; Stage 04 two identical no-write reports/two idempotent applies and 9 application TAP checks; Stage 05 five TAP checks; Stage 06/07 eleven TAP checks; Stage 08 source/tool/stream fixture; Stage 09 six TAP checks all passed |
| ESLint | All changed server/test JavaScript passed. Full changed-file lint reports two pre-existing react-hooks/set-state-in-effect errors in Website Insights effects at lines 80/87. Running ESLint on the committed baseline source reproduced both; the changed Resume handler adds no lint finding |
| Whitespace / transfer | Intended Git diff checked; no environment, secret or temporary file included |

The new database scenarios verify foreign and forged client/agency contexts
(including a busy report), direct ledger denial and ENABLE/FORCE RLS metadata,
non-login owner, mismatched agency/client FK rejection, atomic five-job admission
across three kinds, independence from a foreign agency's lease, duplicate claims,
replacement leases, late-token cleanup, five-failure pause and authorized retry,
oldest-attempt selection, a reused connection with a forged ambient agency,
repeated Hubstaff task upserts, mid-processing agency/client suspension and
mapping changes, source generation changes, provider-denial fixtures, cancellation
versus timeouts, stale sessions, role/assignment revocation and report connection
changes. A separate Node process successfully reclaimed an expired lease;
expiry itself was advanced synthetically. Repeated completion retained one report
and did not call the provider again.

These are real PostgreSQL rows, role permissions, transactions, lease checks,
application workers and source encryption. Hubstaff/Drive network methods and
report Google results were mocked with synthetic data. No live AI/provider call,
consent, task update, real document upload, message or payment occurred. No actual
browser/CDN verification or production scheduler delivery was performed.

Initial checks exposed missing owner row-lock privileges and synthetic reports
inside the existing one-minute limit. The runner now grants the non-login owner
only the required key-column locking privileges; fixture report timestamps are
controlled. A numeric mock list key was corrected to match the real string-keyed
Hubstaff metadata contract. Cancellation assertions were updated to verify rollback
of an in-flight batch while earlier committed progress survives. Final checks pass
apart from the independently reproduced baseline lint findings above.

The Stage 06 service fixture now explicitly verifies fail-closed behavior when an
adopted database has not yet applied migration 007. Positive execution/foreign
selection is exercised by the Stage 10 fixture after the migration. This is not
a bypass or an unreported skip of the service authorization requirement.

### Private setup, remaining checks and resume

No new configuration variable was introduced; `.env.example` and all private
`.env` files are unchanged. Locally absent/empty names are:

- `AGENCY_MIGRATION_DATABASE_URL`: operator-only approved disposable migration
  shell; never the ordinary Next.js/Python runtime or a browser.
- `AGENCY_WORKSPACE_TEST_DATABASE_URL`: synthetic fixture administration in that
  same private test shell. Supply a distinct runtime `DATABASE_URL` for the same
  local database and synthetic `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET`.
- `SOURCE_SYNC_SECRET`, `HUBSTAFF_INDEX_SYNC_SECRET`, `CRON_SECRET`: existing
  Next.js scheduler bearer options; configure the relevant 32+ character secret
  privately in deployment settings and the external scheduler's Authorization
  header. The local watcher names are present, but were not started against the
  configured environment.

The rehearsal generated its private URLs/credentials only in isolated child
processes and verified the fresh loopback server identity before writes. Neon
was untouched. The WSL cluster was stopped and its temporary data removed.
No root Vercel cron config exists; external scheduler registration/delivery and
deployment protection remain unverified. Existing cron routes/authentication and
local watchers are reused. Browser-resumed Website Insights is a different path.

See [STAGE10_JOBS](STAGE10_JOBS.md) for resource/owner contracts, privilege limits,
commands, fixture prerequisites and setup names. On another computer transfer the
local commit/history, check `feat/agency-platform`, read this handoff and recreate
synthetic PostgreSQL from the versioned Stage 03?09 runbooks. Apply 007 with
`npm run agency:jobs -- --confirm-database <disposable-name> --app-role <runtime-login>`
before running the new job fixture. Adopted databases missing 007 intentionally
fail closed. No production migration or deployment is part of this task.

Carry forward live AI/provider sign-in, refresh/revocation and scheduler checks,
managed-secret rotation/restore, **Stage 06 browser verification**, live CDN and
browser back/forward checks. Google-side revocation still has the next-provider/
source-check or 15-minute freshness discovery window; already delivered bytes
cannot be recalled. Stage 20B still supplies publication approval transitions.
Before a live provider check, name the test account/resources/redirect URLs and
have the user complete sign-in/consent privately. No production password/token
belongs in chat.

Stage 10 is complete within this local verification scope. The intended
implementation and this handoff are saved together in the local Stage 10 commit;
use `git log -1` to identify it. Nothing is pushed.
**Stop before Stage 11.** Stage 11 requires its own task/approval; do not enable
agency routes or alter rollout gates as part of this closeout.


## Stage 11 - Local isolation matrix and blocked external rollout

Implemented in `C:\Users\MY PC\Desktop\AI\portal` on `feat/agency-platform`
from clean Stage 10 `d3c9991`. Read AGENTS, CONTEXT, DECISIONS, Stage 10 handoff,
portability guidance, Stage 06 inventory and installed Next.js security/Playwright
docs. No local edits existed at the start. This entry supersedes the Stage 10
stop marker; Stage 12 is not started.

### What changed

- Added [ISOLATION-EVIDENCE](ISOLATION-EVIDENCE.md): explicit passed, failed,
  mocked, blocked and not-run results, environments/commands, role/resource
  matrix, trust limits, fixed failures and the external rollout decision.
- Added a real database/API matrix for Agency A's Orchid/Birch and fictional
  Agency B's Pine/Cedar. Synthetic staff, client roles, operator, multi-agency
  user and unrelated identity cover authorized and denied client/agency actions.
  It tests scoped LOGINs, actual shared-runtime privilege limits, private files,
  exports, conversations, prepared source canaries and revoked revisions.
- Added actual Chrome checks against the full loopback portal production build,
  real Better Auth sign-in and PostgreSQL. They cover libraries/exports, Viewer
  denial, stale tabs, workspace/account switching, host/selector forgery,
  revoked membership/session, copied links, the closed agency gate and the
  client-bound Website Insights UI. No mocked browser API/auth response.
- Chrome reproduced a stale-tab write: after choosing A2, an old A1 document form
  returned 201 and wrote to A2. Document list/add/remove and Website Insights now
  send the original page's x-aoc-client selector, reusing server mismatch checks.
  The patched stale request returns 409 with no A2 row change. Aborted responses
  cannot repopulate obsolete list/detail state.
- Resolved both recorded Website Insights effect lint errors. Initial/detail
  response callbacks update state asynchronously; site selection clears old
  report/history/connection data in its event handler. Internal application code,
  existing role differences and background/provider ownership policies remain.
- Added guarded npm commands for the new database and browser matrices. No new
  runtime secret/configuration, production schema, agency route or rollout
  bypass. Private .env files and .env.example are unchanged.

### Files

| Area | Files |
| --- | --- |
| Client fixes | components/portal/client-documents-panel.js; components/portal/website-insights.js |
| Real DB/API/source fixture | tests/agency-backfill/isolation.database.test.mjs |
| Actual Chrome matrix | tests/agency-isolation/playwright.config.mjs; tests/agency-isolation/browser/isolation.spec.mjs |
| Commands | package.json |
| Handoff/evidence | ISOLATION-EVIDENCE.md; CONTEXT.md; DECISIONS S11-D01; STAGE06_ENTRYPOINTS.md; this entry |

### Computer and private test prerequisites

Node 22.22.2, Python 3.13.17, Next 16.3.3, React 19.2.8, Playwright 1.63.0,
pg 8.23.0, ESLint 9.39.5, cheerio 1.2.0 and installed Chrome 157.0.8103.79
were available. Python pip check reported no broken requirements. No installs
were needed. WSL PostgreSQL binaries and the prior synthetic archive were
available; each rehearsal used a fresh disposable loopback PostgreSQL 18.3
cluster. Its local identity was verified before writes.

AGENCY_MIGRATION_DATABASE_URL and AGENCY_WORKSPACE_TEST_DATABASE_URL remain
absent/empty in the private project environment. Rehearsal URLs and synthetic
BETTER_AUTH_URL/BETTER_AUTH_SECRET were generated privately; the server received
a distinct runtime DATABASE_URL for that same disposable database. All other
private .env assignments were shadowed before build/server startup. Neon was
untouched. No dev watcher, live provider request, message, payment or real client
upload occurred. The local server and WSL database were stopped/removed.

AGENCY_ISOLATION_FIXTURE is a new test-only private path under an ignored .tmp
folder ending in isolation-fixture.json. It contains generated synthetic browser
credentials. It is not committed, served, copied to runtime env examples or
needed by the application. On a new computer recreate fixtures from the versioned
Stage 03-10 runbooks and prepareLegacyFixture; ignored runners/archives/logs are
not included in Git. Detailed commands and setup requirements are in the evidence.

### Actual results

| Check | Result |
| --- | --- |
| New Stage 11 DB/API/source matrix | 8 scenario groups, 9 TAP tests passed; 0 failures/skips |
| Actual Chrome against production portal | 9 passed; real sign-in, HTTP routes, proxy and synthetic PostgreSQL |
| Existing Node top-level | 367 passed, 0 failures/skips |
| Source/Hubstaff index suites | 40 passed, 0 failures/skips |
| Internal Portal suite | 115 passed, 0 failures/skips |
| Offline Python suite | 180 tests reported, 8 opt-in database skips, exit 0; scoped Python fixtures also ran through Stage 06/08 |
| Disposable database regression | Stage 03 nine scenarios; Stage 04 two identical no-write reports/two idempotent applies plus 9 application TAP checks; Stage 05 five; Stage 06/07 eleven; Stage 08 source/tool/stream fixture; Stage 09 six; Stage 10 nine all passed |
| Build / lint | Full Next production build passed with live values excluded. ESLint passed on changed JS/MJS, including the two formerly failing effects |

See evidence for individual cases. The Chrome matrix closes the previously
pending local sign-in, role denial, copied-link, switch, stale-tab and history
navigation checks. It does not establish a genuine BFCache hit, mobile/Safari behavior or live CDN
caching. A separate request-routing-disabled cache attempt passed account-history
checks with external HTTPS/WSS blocked by CDP; measured persisted flags stayed
false, so no restored BFCache snapshot is claimed. No live hosted ChatKit/AI or
provider integration was demonstrated.

Provider callbacks/refreshes, model/tool wire and job network work used explicitly
mocked responses with actual SQL permissions/transactions. Four client source
canaries used real encrypted cache/revision checks; B's client knowledge was
explicitly seeded/reviewed for the fixture and inherited no AOC guidance. Stage
20B's real publication approval workflow is still pending.

Initial fixture issues were corrected: shared-pool double close, a grant already
created by adoption triggers, a Next request-context route called outside HTTP,
ambiguous DOM selectors, login rate-limit state shared across independent cases,
and minimal old report fixtures selected instead of the new valid report. The
browser setup clears only synthetic rate-limit rows per case and preserves the
application's five-attempt limit. The actual stale-tab failure was separately
reproduced and fixed; these initial failures are not counted as final passes.

### Critical limits, setup and next step

The actual shared legacy app login can raw-read a foreign legacy row; the new
matrix intentionally records this existing trusted-service exception. Restricted
agency LOGINs deny raw tables/foreign scopes and new ledgers deny direct access,
but that is not blanket RLS for the shared app credential. Deployment role
verification and explicit security acceptance of this architecture, or separately
reviewed tightening of legacy paths, are prerequisites for external rollout.

The gate remains closed: agency route forms return 404 and non-AOC client UI
remains explicitly disabled. Positive B scoped DB/source checks do not establish
a usable B portal. All executed application unauthorized cases deny after the
fixes; no production isolation certification or pilot approval is granted.

Carry forward:

- Live provider/hosted AI generation, conversation reopen, stream/cache and
  OAuth consent/refresh/revocation checks. Use only named staging test accounts,
  resources and redirect URLs; the user signs in/consents privately.
- Deployed private-file/CDN caching, genuine browser cache restore scenarios,
  runtime-role/managed-secret custody and rotation/restore. These are critical
  verification/acceptance gaps before a pilot; local fixtures cannot close them.
- Scheduler target/registration/delivery. SOURCE_SYNC_SECRET,
  HUBSTAFF_INDEX_SYNC_SECRET and CRON_SECRET remain absent/empty locally. Configure
  the existing 32+ character bearer options privately in deployment settings and
  the named scheduler header before an approved live check. Missing scheduling
  does not grant cross-tenant access, but unattended sync remains unverified.
- The Google-side revocation discovery window remains the next provider/source
  check or 15-minute freshness bound. Already delivered bytes cannot be recalled.
- Stage 20B publication approval transitions and future agency UI/provider flows.

The intended implementation, tests and handoff are saved together in the local
Stage 11 commit (use git log -1). No secrets, .env files, synthetic credential
JSON, logs, screenshots, database archives or temporary runners are committed.
Nothing is pushed. **Stop before Stage 12.** Resume only from this handoff and a
separately supplied Stage 12 task; the external gate must remain closed until
critical evidence gaps are closed and rollout is explicitly approved.


## Stage 11 continuation - Runtime role audit and final local verdict

Continued from `817c314` on `feat/agency-platform` in
`C:\Users\MY PC\Desktop\AI\portal`. This review was interrupted after
implementation/testing; the closing documentation and commit are completed here.
The changes were already transferred into the actual checkout before verification;
ignored .tmp/stage11-review/src files are staging copies, not the runtime source.
No Stage 12 work was started.

### Investigation, required fixes and classification

- Classified every remaining finding in the latest
  [ISOLATION-EVIDENCE review](ISOLATION-EVIDENCE.md#stage-11-continuation-review-from-817c314)
  as a critical isolation blocker or deployment verification task, with reason,
  scope and disposition. Local engineering and external-release verdicts are
  explicitly separate.
- Confirmed both real runtime paths use their process DATABASE_URL. Next DAL and
  default Better Auth factories now use a checked facade over the existing pg
  pool. Python app/preview use guarded connect_database. Both inspect actual
  catalog/session role properties, not a configuration name.
- Fixed acceptance of unsafe runtime credentials in agency-adopted databases.
  The guard rejects owner/elevated membership, BYPASSRLS and a changed effective
  role. Node checks each checkout and discards unsafe/error connections; Python
  checks each new connection and closes on denial. The role decision is not
  cached across requests.
- Server-side Better Auth provisioning without Next cookies stays guarded.
  Only explicit operator CLI commands select the raw provisioning pool, using
  operatorDatabase:true. This is not a public request parameter or environment
  override. Python fixture operator setup is explicitly separate from runtime
  connections; production handlers have no role-guard opt-out.
- Preserved the intentional shared-service legacy model. Raw service SQL can
  read legacy rows across clients because those tables lack tenant RLS; trusted
  request authorization/predicates enforce their application boundary. This is
  not an owner-policy bypass and not a universal RLS claim. No browser/raw SQL
  endpoint or service credential exposure is permitted.
- Added the read-only `npm run agency:runtime:check -- --confirm-database <name>`
  diagnostic and [runtime role guide](RUNTIME_DATABASE_ROLES.md). It prints only
  booleans and requires an approved target configured privately. No schema
  migration, database SDK, runtime secret or .env value was introduced.

### BFCache result

Found Playwright's default --disable-back-forward-cache switch in the installed
Chromium launcher. The isolation configuration now excludes it. The dedicated
scenario removes request routing, blocks external HTTPS/WSS with CDP and records
Page.backForwardCacheNotUsed diagnostics.

Actual Chrome 157.0.8103.79 again reported persisted=false for the same-session
attempt and both post-account-change history restores. Reasons included
MainResourceHasCacheControlNoStore, JsNetworkRequestReceivedCacheControlNoStoreResource,
BrowsingInstanceNotSwapped and CacheControlNoStoreHTTPOnlyCookieModified.
No prior account content was exposed. The test now requires a no-store reason
when no persisted hit is obtained. This is verified protective eviction, not a
claimed true restored BFCache snapshot. That snapshot branch and other/deployed
browser/cache policies remain unexercised; application security headers were
not weakened to force a hit.

### Actual results

All database writes used fresh disposable loopback WSL PostgreSQL 18.3, synthetic
accounts/data and verified local server identity. The actual ordinary app login
was used by both connector paths. No Neon connection was made.

| Check | Result |
| --- | --- |
| New runtime-role database matrix | 5 scenario groups, 6 TAP tests passed; actual Next DAL/Auth/Python connectors and read-only diagnostic |
| Unsafe role cases | Owner/superuser rejected by canonical Next entry point in a fresh process and by actual Python connector; inherited owner, BYPASSRLS and portal relation ownership rejected; raw protected read first demonstrated the unsafe grant |
| Pooled state | A leaked SET ROLE was rejected/discarded before user SQL; a fresh ordinary checkout succeeded; owner membership changes were rechecked rather than cached |
| Four-client isolation DB/API/source matrix | 9 TAP tests passed |
| Actual Chrome matrix | 9 passed with BFCache-disabling switch removed; no-store/cookie eviction diagnostics captured |
| Top-level Node | 370 passed, 0 failed/skipped |
| Source/Hubstaff index | 40 passed, 0 failed/skipped |
| Internal Portal regression | 115 passed, 0 failed/skipped; existing SQL/SQLite fixtures explicitly mock the guard, with real PG role safety covered separately |
| Python offline | 182 tests reported, 9 opt-in DB skips, exit 0; actual Python role probes also ran through the new database matrix |
| Existing Stage 03-10 real DB fixtures | All passed again, including no-write reports/idempotence, workspace/file, source/tool, connection and job checks |
| Build / lint | Full Next production build and changed-JS/MJS ESLint passed with deployment values shadowed |

Initial Internal fixture failures from the new adapter boundary were resolved in
mocked unit setup only. Actual role checks were not disabled in application code.
Every raw fixture operator connection is explicitly separate. Both runtime code
paths are verified against the intended ordinary role locally; live deployment
role attributes and provider pooler mapping/reset remain unverified.

The temporary local server and WSL cluster were stopped; disposable database data
was removed. No live provider, payment, message, deployment, production schema
change, real document upload or push occurred.

### Files and private setup

| Area | Files |
| --- | --- |
| Guarded runtime | lib/runtime-database-role.js; lib/database.js; lib/auth.js; chatkit_backend/database.py |
| Explicit operator commands | scripts/migrate-auth.mjs; scripts/create-client.mjs; scripts/create-admin.mjs; scripts/create-internal-user.mjs |
| Diagnostic | scripts/check-runtime-database-role.mjs; package.json |
| Role tests | tests/runtime-database-role.test.mjs; tests/agency-backfill/runtime.database.test.mjs; chatkit_backend/tests/test_database.py; chatkit_backend/tests/test_runtime_role_database.py |
| Operator/fixture separation | chatkit_backend/tests/test_stage06_database.py; chatkit_backend/tests/test_stage08_sources_database.py; four existing Internal SQL/SQLite unit fixtures |
| Cache test | tests/agency-isolation/playwright.config.mjs; tests/agency-isolation/browser/isolation.spec.mjs |
| Handoff | ISOLATION-EVIDENCE.md; RUNTIME_DATABASE_ROLES.md; CONTEXT.md; DECISIONS S11-D02; docs/DATABASE_PORTABILITY.md; this entry |

Use reviewed non-owner runtime DATABASE_URL values in each service. Configure
passwords privately; owner credentials stay in the operator-only
AGENCY_MIGRATION_DATABASE_URL. Existing AGENCY_WORKSPACE_TEST_DATABASE_URL and the
ignored AGENCY_ISOLATION_FIXTURE path are still the disposable fixture inputs.
STAGE11_EXPECT_RUNTIME_SAFE is an internal test assertion, not runtime setup.
There is no new production setting or role-guard-disable flag. Private .env files
and .env.example were not edited. Current configured/deployed Neon role attributes
were deliberately not queried; do not infer they are safe from a URL username.

Before an approved staging deployment, an operator must configure a LOGIN without
elevated/owner privileges, grant the existing reviewed DML/sequences/functions
and run the diagnostic for both runtimes. Missing grants must not be repaired by
using owner credentials. The guide records exact requirements. Pre-adoption
legacy compatibility remains; the diagnostic does not call it agency-ready.

### Explicit verdict and next step

**Stage 11 local engineering: PASS for the intended server-authorized model.**
The demonstrated elevated-runtime hole is fixed. Intentional legacy service
access remains explicit and is not falsely described as tenant RLS.

**External agency access: HOLD; gate remains closed.** Live hosted-AI privacy and
deployed private-file/CDN behavior are critical external-release isolation
blockers. Actual deployment roles, hosted pooler behavior, provider configuration,
supported browsers, scheduler delivery and secret rotation/restore are deployment
verification tasks. Any failed safety probe becomes a critical configuration
blocker. Operational setup does not by itself show a cross-tenant leak or freeze
unrelated local development. The evidence classifies each item separately.

**Stage 12 local development may proceed after a separately supplied task**, on
recreated disposable fixtures with external agency/non-AOC gates unchanged and
these role checks retained. It is not started here. Never run the default private
Neon configuration for those tests. Repeat affected checks as later features add
surfaces. No invitation, public gate change or production approval is granted.

The intended changes and completed handoff are saved in the local Stage 11 review
commit (git log -1). Secrets, synthetic credential files, logs, screenshots,
database archives and temporary runners are excluded. No push. Stop before 12.


## Stage 12 — local platform-owner console

Completed November 19, 2026 (Asia/Shanghai), from **0064754**, in the actual
`C:\Users\MY PC\Desktop\AI\portal` checkout on `feat/agency-platform`. The tree
was clean at start. User confirmed **synthetic local owner only**; no existing
administrator or real account was promoted. Read Stage 11 closeout/evidence,
AGENTS, existing decisions and installed Next data-security/route-handler guides.
Node 22.22.2, Next 16.3.3, Python 3.13.17, WSL PostgreSQL 18.3 and installed
Chrome 157.0.8103.79 were available. Provider/default Neon configuration was
excluded from verification. No secret or `.env` file was copied or edited.

### Changes and boundaries

- `/platform` reuses the existing Admin shell, sidebar and branding with separate
  navigation. Agency list, literal search, pagination, lifecycle, assigned owner,
  active count, client count, recorded failed jobs/disconnected bindings, provider
  cost aggregates and recent platform audit are available. Subscriptions remain
  explicitly **Not configured**. Costs retain unknown amounts, are scoped by
  agency/client ownership and UTC month, and are not invoices, AOC fees, staffing
  prices or invented subscription charges. No private chats, documents, source
  bodies, encrypted tokens or provider keys are included.
- Additive checksum migration **008_platform_console** creates four FORCE-RLS
  owner-controlled console tables and narrow server functions. Platform ownership
  requires an explicit account assignment; no legacy Admin/multi-agency role,
  cookie, URL or request parameter confers it. Owner can create/change lifecycle;
  operator reads metadata and requests scoped support. Real session, trusted host,
  live role and independent Internal identity checks are enforced server-side.
  New agency owner display is accountability metadata, not an automatic login,
  staff/client assignment, connection, knowledge pack or software subscription.
- Suspension/reactivation has a reason, typed-slug confirmation, optimistic state
  version, idempotent operation and atomic audit. Suspension fences active job
  leases, advances connection generations and revokes support. Reactivation does
  not revive those old authorizations. Data/history/memberships are preserved;
  billing/refunds/subscription state are not changed. Already delivered bytes
  cannot be recalled. The platform operator's unrelated memberships stay intact.
- Added `/admin/aoc` and `/api/admin/aoc-clients`: a narrow AOC-owned client list
  and audited portal/AI access controls, requiring both active legacy Admin and
  explicit AOC agency-admin authority. Platform ownership alone is insufficient.
  Client ownership is locked/rechecked for writes. Existing global `/admin`
  screens keep their all-AOC-estate restriction; they were not expanded to foreign
  agencies. Full mixed-estate replacements for the remaining global Admin screens
  are not claimed. Existing client login/Viewer/Member/Admin paths remain intact.
- Support request/approval UI/API implements only the existing status-read action
  for AOC clients. A platform requester, separate agency approver and separate
  client approver are required. Reasons/tickets, 30-minute expiry, live assignment
  checks, denial/revocation and allowed/denied use are durable. Approvers can see
  permitted request metadata and last use. No impersonation or customer-content
  access exists. Expiry is recorded as a deadline and enforced on checks; no new
  autonomous expiry-notification/scheduler event is claimed. External agency
  support remains gated, as do `/agency`, `/api/agency` and non-AOC client entry.
- Added explicit operator assignment and synthetic review seed/launcher commands.
  They create no known default password or real owner. Review launcher scrubs
  remote/provider/operator settings before starting loopback Next; no AI backend
  or local source/Hubstaff watcher is started. `.tmp` is explicitly ignored.

### Actual verification

| Check | Result / evidence type |
| --- | --- |
| Top-level `node --test tests/*.test.mjs` | **372 passed, 0 failed/skipped**, including review-tool remote/query-override refusal; controlled/offline tests |
| Existing source + Hubstaff indexing suites | **40 passed**, 0 failed/skipped; offline/provider fixtures |
| Existing Internal Portal suite | **115 passed**, 0 failed/skipped; controlled fixtures |
| Python offline discovery | **182 tests reported, 9 opt-in DB skips, exit 0**; separate actual Python role SQL covered below |
| Migration 008 CLI | **Passed first application and identical checksum rerun** on fresh disposable WSL PostgreSQL using separate operator/runtime logins; zero legacy Admin promotions |
| Stage 12 `test:platform:database` | **11 passed** (10 scenario groups + parent), 0 failed/skipped; actual Better Auth sessions and PostgreSQL, actual API handlers, no provider mocks needed |
| Stage 12 database matrix | Owner/operator allow; agency/client/legacy Admin deny; forged scope/mass assignment/origin/host deny; idempotent provisioning and concurrent/stale lifecycle conflict; no automatic client/source/connection inheritance; known/unknown per-agency costs; FORCE flags/direct ledger denial; pooled privilege cleanup; revoked/demoted/expired sessions; inactive Internal-account exclusion; dual support consent/self/foreign denial, expiry/denial/revocation; suspension fences jobs/connections/grants and retains history; AOC-scoped writes deny foreign clients |
| Stage 12 Chrome `test:platform:browser` | **7 passed** against the actual production build: login/list/search/create, operator read-only, agency/client/legacy Admin UI+API denial, confirmed suspension/reactivation/audit, already-open role revocation, AOC delivery in mixed estate, two-account support consent and status-only result |
| Stage 11 Chrome regression | **9 passed** again; files/exports, stale tabs/workspace switching, revocation, external gate, Website Insights and actual BFCache attempt. No persisted BFCache restore is claimed; previous no-store/cookie limits remain |
| Actual runtime-role SQL | **6 passed** again, including Next/Python connector rejection of elevated/owner/BYPASSRLS/inherited-owner roles and polluted pooled SET ROLE |
| Stage 11 four-client PostgreSQL matrix | **9 passed** again on ordinary runtime and restricted agency LOGINs |
| Stage 03–10 regressions | Foundation **9 SQL scenarios**; two identical no-write backfill reports, two applies (first 51 ownership rows / 7 quarantines; second 0 changes), legacy rows/sequences/history preserved; Stage 04 **9**, Stage 05 **5**, Stage 06/07 **11**, Stage 08 **1**, Stage 09 **6**, Stage 10 **9** TAP checks passed. Source/AI/provider work uses documented fixtures/mocks, not live providers |
| Synthetic review seed / explicit assignment commands | **Passed** on the disposable DB using canonical lib/postgres.js operator provisioning and the explicit operator-only auth factory; creates fresh random-password owner/contact accounts and audited assignment. Generated private credential artifact was removed after this check |
| Full lint / focused changed-file lint | **Passed**, exit 0 |
| Full Next production build | **Passed**, remote/private environment assignments shadowed; new pages/API routes built successfully |

Initial fixture failures were corrected without weakening authorization: legacy
membership triggers already create agency grants, and Better Auth deletes expired
sessions, so the fixture now uses compatible upserts and a genuine fresh login.
Browser selector ambiguity between directory/audit rows and a support select was
corrected; the final suites above pass. Local screenshot inspection confirmed
the console uses the existing layout. Mobile/other-browser and live deployment
verification are not claimed. Manual review launcher success is not a separate
dev-server/browser pass; Chrome exercised the isolated production server.

All tests ran from the **actual project paths**, after verifying branch/commit
and copying only reviewed source files from ignored preparation mirrors. No
application relies on `.tmp/stage12/src`. Independent scratch mirrors/logs are not
part of the commit. The disposable Next server and WSL cluster were stopped and
the temporary database cluster removed after the final run.

### Files, private setup and review

| Area | Intended project paths |
| --- | --- |
| Database/operator | database/agency-platform/008_platform_console.sql; scripts/migrate-platform-console.mjs; scripts/set-platform-access.mjs |
| Server/API | lib/platform-console.js; app/api/platform/agencies/route.js; app/api/support/requests/route.js; app/api/admin/aoc-clients/route.js |
| Frontend | app/platform/page.js; app/support/requests/page.js; app/admin/aoc/page.js; components/platform/*; two optional navigation additions in components/admin/admin-{shell,sidebar}.js |
| Review commands/tests | scripts/seed-platform-review.mjs; scripts/dev-platform-review.mjs; tests/platform-review.test.mjs; tests/agency-backfill/platform.database.test.mjs; tests/platform-console/*; package.json; .gitignore |
| Handoff | STAGE12_PLATFORM_CONSOLE.md; ISOLATION-EVIDENCE.md; CONTEXT.md; DECISIONS S12-D01; this entry |

**Manual frontend URL: http://127.0.0.1:3000/platform**. Sign in at `/login` with
a newly generated synthetic owner, then open that URL; an owner without client
membership is not silently put into a client or legacy Admin workspace.

The primary checkout has no configured `.env.agency-test` manual review profile.
Privately configure **DATABASE_URL** (ordinary local runtime),
**AGENCY_MIGRATION_DATABASE_URL** (separate local operator), **BETTER_AUTH_URL**
(exact loopback origin above) and **BETTER_AUTH_SECRET** in that ignored file,
after restarting/preparing a retained migrated synthetic WSL database. Do not
reuse the default Neon settings. Run migration/seed/review commands in
[STAGE12_PLATFORM_CONSOLE](STAGE12_PLATFORM_CONSOLE.md); credentials are written
only to ignored `.tmp/platform-review/accounts.json`. The reviewed seeder does
not overwrite an existing account file. The acceptance runner's database was
removed, so its temporary usernames/passwords cannot be used after closeout.

For a test repeat, privately supply existing operator
**AGENCY_WORKSPACE_TEST_DATABASE_URL**, distinct runtime **DATABASE_URL**,
synthetic auth, **AGENCY_ISOLATION_FIXTURE** and new test-only
**PLATFORM_CONSOLE_FIXTURE** paths for the prepared matching fixture. They are
not production runtime settings or new provider secrets. No `.env.example`
placeholder is needed for a new runtime setting because none was introduced.

No provider sign-in or live credential was requested/used. Carried forward:
hosted-AI privacy and deployed private cache/CDN are **critical external-release
checks**; deployed runtime/pooler role mapping, supported browsers, Google
scope/resource/refresh/reconnect/revocation, scheduler registration/delivery and
secret rotation/restore remain deployment verification. The Google revocation
window remains next provider/source recheck or at most the existing 15-minute
freshness window; no webhook/instant recall claim is added. Existing
SOURCE_SYNC_SECRET / HUBSTAFF_INDEX_SYNC_SECRET (or documented CRON_SECRET
alternative) belong privately in the scheduler and Next deployment when that
specific live check is approved. See Stage 09/10 setup for provider/rotation names.

### Verdict and resume

**Stage 12 local engineering complete; external agency access remains HOLD.**
No production/Neon access, real customer document, provider call, payment, real
message, deployment, external invitation or push occurred. Actual runtime guards
were preserved. Real initial platform ownership still needs a separately approved
secure identifier; this does not block the authorized synthetic local console.

The intended work and handoff are saved in the local Stage 12 commit (`git log
-1`). Review the runbook and evidence before a separately authorized Stage 13.
**Stop here: Stage 13 was not started.**


## Stage 13 — agency-scoped administration

Completed local engineering November 19, 2026 (Asia/Shanghai), from **b2d36ce**
on `feat/agency-platform` in **C:\Users\MY PC\Desktop\AI\portal**. The user
explicitly corrected the accidental specialist-stage paste: **Stage 13 only;
stop before Stage 13A**. Existing partially prepared Stage 13 edits were preserved
and completed after interruption. Stage 12 documentation, private account/config
files, existing local review data and runtime guards were preserved. Read AGENTS,
CONTEXT, DECISIONS, Stage 12 handoff/runbook, database portability and installed
Next data-security, route-handler and navigation documentation before editing.

### Implemented behavior

- Added a self-contained `/admin/agency` area with explicit agency selector and
  client, staff/access, permitted settings, source/connection status, usage and
  audit pages. It reuses existing Admin components/branding; no Platform Console
  navigation or authority is inherited. Default legacy Admin navigation remains.
- Server and SQL checks reuse real Better Auth sessions, trusted host/origin,
  live request-agency membership, active agency and independent Internal-user
  protections. Every read/write derives the permitted agency and checks client
  ownership. Multiple memberships require explicit selection; a URL/header never
  grants access. Private no-store responses and workspace-specific component
  keys prevent shared view state. Revocation/downgrade is checked on subsequent
  API requests and UI refresh/focus; persisted page restore reloads authorization.
- Owner: own-agency management plus permitted settings, recorded provider costs
  and ownership transfer. Agency Administrator: own clients and lower staff/client
  grants, without owner/billing settings or peer promotion. Delivery staff: only
  explicitly assigned clients and own staff/grant record. Client Administrator
  never becomes Agency Administrator. Platform role alone grants no delivery
  access. No HR/specialist role or employment-based access was added.
- Client creation is agency-owned/idempotent with Stage 04 classification and AI
  disabled by default. Client edits reuse website/Hubstaff validation; duplicate
  project links and foreign ownership IDs are denied. Client-to-agency transfer,
  platform keys, global pricing, billing references and unrestricted source packs
  are not mass-assignable. New users/credentials/knowledge are not inherited.
- Staff roles, client assignments and local existing-account invitations are
  scoped to the agency. An inviter cannot grant a higher role. Recipient acceptance
  is explicit, finite (24 hours), rechecks current inviter authority and cannot
  activate a foreign-client grant. Duplicate memberships, expired/revoked invites
  and unrelated recipients deny without writes. No invitation email was sent.
- One accountable active Agency Owner is protected by API checks **and deferred
  database invariants**. Transfer to a different active same-agency administrator
  requires a reason/current revision/typed slug; old owner loses owner/billing
  rights. Removing/deactivating/downgrading the final owner, deleting governance,
  mismatching ownership display or converting that owner into an Internal identity
  is rejected. No Stage 12 displayed owner was automatically activated/promoted.
- Staff revocation disables that agency's client grants/memberships and applicable
  support grants. Other agencies and the global login remain. Reactivation alone
  does not restore the old client grants; an explicit assignment is required.
  Existing client-admin protection is retained when editing client grants.
- Settings expose only support name/email and timezone. Usage is current UTC-month
  recorded requests/tokens for permitted clients; provider-cost summary belongs
  only to Agency Owner and preserves unknown amounts. These are not invoices,
  staffing prices, subscription changes or AOC fee changes. Audit includes scoped
  administration actions and sanitized existing client operations, no platform/
  foreign/private payloads. Client/member/audit views are bounded to 100 rows;
  large-estate pagination remains a refinement, not an unbounded export.
- Sources adapt approved revision/freshness/connection **status only**, excluding
  private administrator packs/source titles/bodies/credential fields and foreign
  scopes. New agencies inherit no AOC knowledge or connections. Client project
  mappings are configurable; a URL is not live resource validation. New agency
  OAuth/provider onboarding is still gated and source publication edits/approval
  remain the later Stage 20B dependency. Existing source checks are preserved.
- Additive checksum migration **009_agency_administration** creates three ENABLE/
  FORCE-RLS owner-controlled tables and narrow fixed-search-path SQL functions.
  Runtime uses lib/database.js; provisioning lib/postgres.js; migrations short-
  lived pg clients. No SDK, extension, guard-disable switch or runtime DDL added.
  The legacy shared-service model remains explicit, not universal legacy-table
  tenant RLS. No existing real account is automatically promoted.

### Closed gate and actual verification

New review entry points are default-closed. Server-only
`LOCAL_AGENCY_ADMIN_REVIEW` works **only** with a loopback HTTP origin and synthetic
loopback rehearsal DB with no query override. The template entry is blank. A
fixture's governance must separately be explicitly enabled. `/agency`,
`/api/agency`, non-AOC client entry, platform guards and Stage 11 rollout holds
remain unchanged. This is local engineering approval, not external agency rollout.

| Check | Actual result / type |
| --- | --- |
| Migration 009 | **Passed first application and identical repeat**, separate non-owner runtime/operator, fresh disposable WSL PostgreSQL 18.3. No real workspace activated |
| Stage 13 database/API matrix | **11 passed** (10 scenario groups + parent), 0 failed/skipped. Actual PostgreSQL, Better Auth sessions and actual route handlers; no external provider needed |
| Two-agency SQL/API coverage | Own client/staff/settings/usage/audit allow, cross-agency denial and same-agency assigned-client restriction; platform/client/Internal role boundaries; host/origin/local gate/foreign runtime target refusal; stale workspace headers; idempotent owned clients; foreign/mass-assignment denial; invitations with separate recipient consent, duplicate/expired/revoked/stale-inviter denial; final-owner database/API checks and scoped transfer; session/role/membership/suspension changes; protected-ledger denial, pool cleanup; concurrent version conflict with only one committed write |
| Stage 13 Chrome | **9 passed** on the actual production build: both agency views, staff read-only/direct API denial, client creation, platform/client role denial, ownership UI/last owner, workspace switching/stale scope, open-view revocation, invitation UI/recipient acceptance, already-open role downgrade |
| Stage 12 regression | **11 actual DB/API** and **7 Chrome** checks passed again; platform roles, lifecycle, support consent and AOC delivery remain working |
| Stage 11 regression | **6 runtime-role**, **9 four-client DB** and **9 Chrome** checks passed again. Actual Next/Python connector role checks retained; original BFCache limitations unchanged |
| Earlier real SQL fixtures | Stage 03 **9 scenario groups**; Stage 04 two identical no-write reports and two applies (51 rows / 7 quarantines first, 0 changed second), identical legacy rows/history/sequences; Stage 04 **9**, Stage 05 **5**, Stage 06/07 **11**, Stage 08 **1**, Stage 09 **6**, Stage 10 **9** TAP checks passed again |
| Offline regressions | **372** top-level Node, **40** source/index and **115** Internal tests passed, no failures/skips in those suites. Python **182 tests reported, 9 opt-in DB skips, exit 0**. Provider/source/AI mocks remain explicitly fixture evidence, not live service checks |
| Lint / full build | Focused lint and **full frontend lint passed**, exit 0. **Full Next production build passed** with private/remote variables shadowed |
| Actual review setup | Fresh separate synthetic DB prepared via existing migrations/seed/launcher. Ordinary runtime role diagnostic passed. Real HTTP owner login, agency API/page and closed external gate verified on **port 3001**. No real provider or mail |

The interrupted preparation had no finished Stage 13 database verification.
Real checks caught a fixture numeric parameter ambiguity and source-table alias
ambiguity; both were corrected. Browser select accessibility/locator issues were
corrected with explicit accessible control names. Final tests above pass without
weakening authorization. Screenshot inspection used synthetic pages only. Mobile,
other browsers, real hosted AI/provider/CDN/production transport remain unverified.

### Actual files, private configuration and local review

| Area | Actual project paths |
| --- | --- |
| Database / operator | database/agency-platform/009_agency_administration.sql; scripts/migrate-agency-administration.mjs |
| Server | lib/agency-administration.js; app/api/admin/agency/route.js; app/api/admin/agency/invitations/route.js |
| Frontend | app/admin/agency/page.js; app/admin/agency/[view]/page.js; app/admin/agency/invitations/page.js; components/agency/*; optional agency labels/navigation in existing Admin shell/sidebar |
| Local fixture/review | scripts/agency-review-fixture.mjs; scripts/seed-agency-review.mjs; scripts/dev-platform-review.mjs --agency-admin; package.json; blank local-only flag in .env.example |
| Tests | tests/agency-backfill/agency-admin.database.test.mjs; tests/agency-administration/playwright.config.mjs; tests/agency-administration/browser/agency.spec.mjs |
| Handoff | STAGE13_AGENCY_ADMINISTRATION.md; CONTEXT.md; DECISIONS S13-D01; ISOLATION-EVIDENCE.md; this entry |

Final application/tests are in the **actual AI\portal paths**, hash-checked against
reviewed preparation files; no runtime imports a `.tmp/stage13/src` mirror. Those
scratch mirrors, logs, dumps, browser artifacts, generated credentials and local
environment files remain ignored and outside the commit. Existing edits were
preserved. No push.

**Review login: http://127.0.0.1:3001/login**

**Agency interface: http://127.0.0.1:3001/admin/agency**

Open the private ignored `.tmp/agency-admin-review/accounts.json` in your editor.
Use **accounts.ownerA.username / accounts.ownerA.password** for fictional Harbor,
or **accounts.ownerB** for Summit. `staffA`, `staffB`, `adminA`, `multi`, `clientA`
and `platformOnly` cover the other permission cases. No credentials are in this
handoff/chat. After login, open the agency URL directly; client-root “no client
assigned” does not grant or deny agency administration. The Stage 12 owner in
the separate port-3000 DB is not this test identity.

The retained local profile **.env.agency-stage13** was generated privately with
**DATABASE_URL** (ordinary loopback runtime), **AGENCY_MIGRATION_DATABASE_URL**
(separate operator), **BETTER_AUTH_URL** (port 3001) and **BETTER_AUTH_SECRET**.
No Stage 13 local prerequisite remains missing on this computer. No `.env.local`
or existing `.env.agency-test` value/file was copied or changed. The launcher
sets **LOCAL_AGENCY_ADMIN_REVIEW=true** only with explicit `--agency-admin` and
scrubs provider/operator settings before starting the verified production build.
For a fresh verification fixture also privately supply existing
**AGENCY_WORKSPACE_TEST_DATABASE_URL** and ignored **AGENCY_ADMIN_FIXTURE** path;
they are operator/test inputs, not browser settings. See the new runbook for exact
commands and resuming/reseeding safeguards. Account file overwrite is refused.

The separate acceptance server/database were stopped/removed. The **retained
Stage 13 review** server/database remain running at user-review closeout, alongside
the preserved Stage 12 review on port 3000. Both login pages returned HTTP 200.
Non-secret status/process metadata and private logs are in the original checkout's
ignored `.tmp/stage13/`; stop only the recorded processes/cluster. Browser cookies
share the host across ports: use separate browser profiles when comparing both
databases, or sign in again with the matching fixture. User-edited original
Stage 12 accounts and private files were preserved.

### Remaining checks and next permitted stage

**Stage 13 local engineering complete. External agency access remains HOLD.**
Hosted-AI privacy and deployed private CDN/cache remain critical external-release
isolation checks. Deployed runtime/pooler mapping, Google/provider consent/resource
validation/revocation, scheduler registration/delivery, rotation/restore and
supported browsers remain deployment verification tasks. The previous Google
next-check / 15-minute freshness revocation window is unchanged. No scheduler,
provider connection, publication approval workflow, production mail transport or
live billing integration is claimed here. Real agency activation and new-account
email invitations need separately approved identities/recipients/transport.

The intended work is committed locally (git log -1). Neon, production, real
payments/messages/personnel records and real customer access were untouched.
**Stop before Stage 13A.** Specialist engagements, coverage, assignments and HR
exclusion tests for that new model are not implemented in this stage. Resume only
with a separately supplied Stage 13A task, using this handoff and a fresh approved
synthetic fixture. No push or external rollout approval.


## Stage 13A — scoped specialist assignments

Completed local engineering November 19, 2026 (Asia/Shanghai), from **4316efd**
on `feat/agency-platform` in **C:\Users\MY PC\Desktop\AI\portal**. Read AGENTS,
CONTEXT, DECISIONS, Stage 13 handoff, database portability and installed Next
security/routing guidance; reused the working Admin shell, agency authorization,
session checks, PostgreSQL library/private download headers and runtime guards.
The working tree was clean at start. Existing retained review profiles/accounts
and servers on ports 3000/3001 were preserved. No Neon, real provider, payment,
message, invitation, personnel import or external agency access occurred.

### Implemented contract and behavior

- Additive migration **010_specialist_assignments** separates staffing engagements,
  scoped delivery assignments and notes in three ENABLE/FORCE-RLS owner-controlled
  tables. Narrow fixed-search-path SECURITY DEFINER functions enforce resource and
  action checks; portable standard PostgreSQL only. Next uses lib/database.js,
  provisioning lib/postgres.js, migrations short-lived pg and Python its guarded
  connector. No role-guard bypass, provider SDK or runtime DDL was introduced.
- A staffing engagement can exist without a portal identity. An agency admin may
  explicitly link an approved existing account later; neither recording nor
  linking creates membership/client rights. Employer/payment/name matches are
  not authorization. A Whitecap manager receives no automatic customer access.
- Only the active Agency Owner or Agency Administrator approves assignments,
  temporary coverage, replacements, revocation and engagement end within the
  chosen agency. Delivery staff, Client Admin, platform-only or specialist roles
  cannot approve. Each assignment binds exact agency/client/engagement/account,
  work type, allowed actions, explicit files, delivery role/responsibilities/
  deliverables/handoff, active agency-admin review owner, approving actor and
  finite expiry (future, max 90 days). Existing inactive agency membership is not
  silently reactivated. No legacy client membership, client_access, agency-admin
  or Internal panel grant is created from specialist approval.
- Specialist actions are **delivery.read**, optional **delivery.files.read** and
  **delivery.notes.write** only. Assignments are separate from any independently
  approved ordinary membership; ending staffing does not silently change unrelated
  customer grants. General client/agency/platform AI and background job rights
  are not inferred from the specialist role.
- Agency UI `/admin/agency/specialists?agency=<slug>` and API provide engagements,
  account linking/end, explicit assignment approval, replacement and revocation.
  The existing agency navigation links it for administrators. Specialist `/delivery`
  shows only active approved assignment choices; `/delivery?assignment=<uuid>`
  shows that context, permitted files and notes. Switching is explicit and does
  not reuse another assignment's scope or content.
- Replacement creates a new scope/recipient and marks the previous assignment
  replaced atomically, with version/conflict checks. It cannot move work across
  clients/agencies. Engagement end revokes all its active assignments; past
  assignment IDs cannot be reopened. Audit retains actor/reason/context. Note
  writes are idempotent and recheck after lock acquisition and before completion.
- Every delivery/file/note/evidence request checks the real live session,
  non-Internal identity, active agency/governance/membership/client, correct
  engagement, active assignment/review owner, action and clock expiry. Specialist
  work checks before execution, protected write, after write (transactional) and
  before output. In-flight revocation denies delivery; expiry rolls back pending
  writes. This reuses the existing check/write pattern, **not a new queue or
  scheduler**. Existing report/Hubstaff/source jobs remain unavailable without
  their separate existing permissions.
- Downloads use explicit approved file IDs in that client library and existing
  safe attachment/cache headers. No signed URL/bearer grant is issued: **no residual
  signed-link lifetime** exists. Copied links need current authorization again.
  Already authorized in-flight/downloaded bytes cannot be recalled. The UI checks
  on focus/manual refresh/every 15 seconds, and reloads on persisted restore;
  this is not instant deletion of previously displayed/downloaded information.
- Personnel fields/HR tables/coaching/leave/payroll/candidate information/private
  admin sources are absent from delivery queries and approved evidence projection.
  Real personnel records were not imported. Synthetic HR canaries are private
  fixture data only. Approval UI permits business context/files only and rejects
  arbitrary personnel/privilege fields. Free text/files are untrusted data, not
  tools/authority; no automatic classifier of all possible human content is claimed.

### AI boundary — explicit implementation limit

New SQL/Next/Python specialist evidence loaders expose a whitelist of approved
business fields only and recheck the assignment for consumers. **No new specialist
ChatKit chat, general AI permission or live provider call is enabled.** Existing
client AI/session/tool/privacy checks remain unchanged and deny specialist-only
accounts. Actual Python/PostgreSQL evidence retrieval was tested with a private
HR canary and a deterministic **mocked answer** from allowed deliverables. It is
not a live AI-answer/hosted-privacy test. Future specialist-aware AI consumers must
use these guards before tools/write/output, preserve existing response privacy
filters and obtain separately approved provider/data-destination configuration.

### Actual checks and environment

| Check | Actual result / evidence type |
| --- | --- |
| Migration 010 CLI | **First apply + identical checksum repeat passed**, fresh disposable WSL PostgreSQL 18.3, separate ordinary runtime/operator. No existing account/source/workspace promoted |
| Stage 13A actual DB/API/Python matrix | **11 passed** (10 scenario groups + parent), 0 failed/skipped. Real PG, Better Auth sessions, API handlers and guarded Python connector; model answer mocked |
| Assignment/permission checks | Engagement-only and employer/manager denial; account-optional engagement/link without data rights; agency-approved exact scope; foreign agency/client/file denial; unsupported action/personnel-field rejection; explicit read-only denies file/note; per-user choices; copied URL/private headers; idempotent notes; untrusted text cannot escalate |
| Lifecycle/work checks | Actual replacement and old-scope/file denial; expired/revoked membership/engagement; inactive Internal-account exclusion; in-flight output denial; expiry rollback leaves no note; raw runtime ledger denial; general AI/report-job denial; session deletion prevents subsequent access |
| HR/AI evidence | Actual SQL/Python field projection and recheck pass, private HR canary absent. Deterministic fake answer uses allowed evidence only. Three Python offline tests cover narrow SQL, sanitized denial and unsupported-action/no-query behavior. **No live model test** |
| Stage 13A Chrome | **7 passed** against actual production build: separate A/B specialist contexts/files, manager/unrelated/Internal denial, note/action scope, engagement + assignment approval UI, expiry/session invalidation, replaced-context denial and actual administrator replacement/engagement-end UI |
| Prior Stage 13 / 12 / 11 | Stage 13 **11 real DB + 9 Chrome**; Stage 12 **11 real DB + 7 Chrome**; Stage 11 **6 runtime-role + 9 four-client DB + 9 Chrome** passed again. Existing role guards, client isolation, owner controls and external gate preserved |
| Earlier SQL fixtures | Stage 03 **9 scenarios**; Stage 04 two matching no-write reports, 51 ownership rows/7 quarantines first apply, 0 changes second, preserved all legacy rows/history/sequences; Stage 04 **9**, Stage 05 **5**, Stage 06/07 **11**, Stage 08 **1**, Stage 09 **6**, Stage 10 **9** TAP checks passed again |
| Offline regressions | **372** top-level Node, **40** source/index, **115** Internal tests passed, no failure/skips in those suites. Python **185 tests reported, 9 opt-in DB skips, exit 0**. Source/provider/AI mocks remain fixture evidence |
| Lint / production build | Focused + **full frontend lint passed**, exit 0. **Full Next production build passed**, private/remote environment assignments shadowed |
| Retained review setup | New separate synthetic DB, migration/seed/ordinary runtime diagnostic passed. Actual owner and specialist HTTP sign-ins, scoped delivery/API/page and denial of general AI + external gate verified at port **3002**. No missing local configuration after setup |

Initial Python fixture failures were a missing connector DSN and Windows async
Proactor loop; fixed using the explicit synthetic DSN and a compatible test event
loop, without changing runtime guards. The final checks above pass. No production
database or live API was used to repair a test. Existing AI/source/role results
are kept separate from the new local evidence. Mobile/other-browser and deployed
cache/pooler behavior remain unverified.

### Files and private review

| Area | Actual primary project paths |
| --- | --- |
| Database / migration | database/agency-platform/010_specialist_assignments.sql; scripts/migrate-specialist-assignments.mjs |
| Server / consumers | lib/specialist-assignments.js; app/api/admin/agency/specialists/route.js; app/api/delivery/route.js; app/api/delivery/files/[id]/route.js; chatkit_backend/specialist_access.py |
| Frontend | app/admin/agency/specialists/page.js; app/delivery/page.js; components/agency/specialist-console.js; specialist-delivery.js; administrator-only agency navigation link |
| Fixtures/review | scripts/specialist-review-fixture.mjs; scripts/seed-specialist-review.mjs; explicit port-3002 support in existing dev-platform-review.mjs; package.json |
| Tests | tests/agency-backfill/specialists.database.test.mjs; tests/specialists/*; chatkit_backend/tests/test_specialist_access.py |
| Handoff | STAGE13A_SPECIALISTS.md; CONTEXT.md; DECISIONS S13A-D01; ISOLATION-EVIDENCE.md; this entry |

Final code/tests/docs live in **AI\portal project paths**, not only scratch
`.tmp/stage13a/src`; hashes/branch/baseline are verified before staging. Existing
private files/user edits were preserved. No secrets, generated accounts, environment
profiles, dumps, screenshots, logs, private canaries or temporary helpers are
included in Git. The separate acceptance database/server were stopped/removed.

**Specialist login: http://127.0.0.1:3002/login**

**Specialist workspace: http://127.0.0.1:3002/delivery**

**Agency approvals: http://127.0.0.1:3002/admin/agency/specialists?agency=s13-harbor**

The retained specialist review server/database remain running; earlier port-3000
and port-3001 reviews remain running as well. Private **.env.specialist-review**
was generated for that fresh disposable loopback target with DATABASE_URL (ordinary
runtime), AGENCY_MIGRATION_DATABASE_URL (separate operator), BETTER_AUTH_URL (3002)
and BETTER_AUTH_SECRET. Existing .env.local and review profiles were not copied
or changed. The launcher enables existing LOCAL_AGENCY_ADMIN_REVIEW only under
the guarded loopback/synthetic contract and scrubs provider/operator settings.
No new runtime variable/provider secret or .env.example placeholder was needed.

The ignored **.tmp/specialist-review/accounts.json** is open privately in the
editor. Use **specialists.specialistA.username / specialists.specialistA.password**
for the two-agency specialist, **accounts.ownerA** for Harbor approvals, ownerB
for Summit, specialistB for replacements and whitecapManager for the no-access
example. Do not paste passwords into chat. Open the proper route after login;
the client root is not the specialist workspace. Cookies are host-scoped across
ports, so separate browser profiles help when comparing different review DBs.

For a repeat, privately supply the existing operator
AGENCY_WORKSPACE_TEST_DATABASE_URL, separate runtime DATABASE_URL, synthetic auth,
LOCAL_AGENCY_ADMIN_REVIEW and prepared AGENCY_ADMIN_FIXTURE; the new test-only
SPECIALIST_FIXTURE is an ignored matching fixture path. See STAGE13A_SPECIALISTS
for migration/seed/launcher/test commands and refusal to overwrite existing files.
No current local prerequisite is missing. No live sign-in/consent was required.

### Remaining checks and stop gate

**Stage 13A local engineering complete; external agency rollout remains HOLD.**
The public agency paths and non-AOC client entry remain gated. Existing runtime
role guards and private admin/source controls are unchanged. Hosted-AI privacy
and deployed private CDN/cache remain critical external-release checks; deployed
runtime/pooler mapping, provider consent/resource/revocation, scheduler delivery,
secret rotation/restore and supported browsers remain deployment tasks. Google
revocation remains the prior next-check / 15-minute source freshness window.
Specialist ChatKit/provider integration and new queue/mail/payment/HR workflows
are not claimed. Source publication approval remains Stage 20B.

The intended work and handoff are committed locally (git log -1). No Neon, real
personnel/customer access, provider upload, paid action, real message or push.
**Stop before Stage 14.** Resume only after a separately supplied task with these
limits and approved disposable fixtures. No external invitation/rollout approval.

## Stage 14 — local closeout, 2026-11-19

**Completed locally; external agency and privileged production rollout remain
HOLD. Stop before Stage 15.** Based on Stage13A 4bbc4e0 in the actual primary
AI\portal checkout, feat/agency-platform. Initial tree was clean; all existing
Stage01–13A documents/code were preserved. Final local commit is git log -1.
No push. Neon, .env.local, real accounts, provider documents and real mail stayed
untouched. Earlier review ports3000–3002 were preserved.

### Changes and working paths

Installed Better Auth1.7.2 was inspected before implementation. Reused its TOTP,
backup-code, verification, reset and session APIs with the existing guarded pg
runtime, Stage13 invitation acceptance/memberships and Stage13A specialist checks.
No provider/auth/storage replacement or upgrade.

011 adds protected invitation hashes, session-factor assurance, security audit and
operator-only account authorization controls. Intended account/client/agency/role,
live inviter, expiry and replay checks occur transactionally. UUID-only acceptance
rejects. Existing users retain their identity. A Members & Access invitation
request grants nothing until an authorized Agency Administrator approves it;
existing role changes/scoped revocation/audit remain in use. No shared temporary
password is generated by that security-mode flow.

Privileged platform/agency/legacy Admin sessions need verified email and current
provider MFA. Both runtime consumers, privileged SQL entry points and user-run
jobs recheck policy; role escalation is not a session/header claim. Factor
replacement/privileged disable/trusted-device bypass reject. Reset revokes account
sessions, preserves MFA/memberships; workspace removal preserves other agencies.
Specialist approval, expiry, actions, private HR exclusions and Internal roles stay
independent. MFA records do not grant a customer resource.

| Area | Actual primary paths |
| --- | --- |
| Auth / policy | lib/auth.js; auth-client.js; auth-security-hooks.js; account-security-policy.js; auth-mail.js; invitation-links.js |
| Database | database/agency-platform/011_account_security.sql; scripts/migrate-account-security.mjs; both runtime-database-role guards include twoFactor ownership |
| Authorization consumers | lib/portal-data.js; admin-data.js; internal-user-data.js; platform-console.js; client-members.js; agency-administration.js; debugger/access.js; chatkit_backend/workspace_access.py |
| Account UI/API | app/account/{security,mfa,recovery,reset,verify,invitation}/page.js; app/api/account/security/route.js; supported auth handler; components/auth/account-controls.js and login-form.js; proxy.js |
| Invitation UI | Existing agency staff/inbox and client Members & Access components; original invitation API and Stage13 ownership/last-owner protections reused |
| Review / tests | scripts/seed-account-security-review.mjs; check-account-security-review.mjs; dev-platform-review.mjs; package scripts; tests/account-security/*; tests/agency-backfill/account-security.database.test.mjs; three pre-011 Internal test adapters explicitly model missing policy |
| Handoff | STAGE14_ACCOUNT_SECURITY.md; CONTEXT.md; DECISIONS S14-D01–03; ISOLATION-EVIDENCE.md; this entry; three blank .env.example names |

Scratch .tmp/stage14/src is only a transfer mirror. Tests import/build/serve actual
AI\portal paths; branch/baseline and mirrored hashes are verified before staging.
No .tmp source, generated accounts, profiles, dumps, logs, screenshots, canaries,
mail captures, passwords or MFA seeds/codes are included in Git.

### Actual results

* **16/16 Stage14 TAP checks, no skips**, on fresh loopback WSL PG18.3 with separate
  ordinary runtime/operator roles. Official provider migration and 011 repeat
  application passed. Wrong-account/hash/scope/expiry/replay/role cases deny;
  concurrent invite replay succeeds once. Password reset invalidates sessions but
  preserves MFA/memberships. Other-agency access remains after scoped removal.
  FORCE-RLS raw ledger reads deny. Both Node/Python reject new factor-table
  ownership; Python envelope denies unassured privilege. Specialist expiry denies.
* **8/8 Chrome scenarios** on the exact production build: challenge/direct API
  checks, intended invitation and same-tab reopening/replay, password recovery,
  other-session revocation, fragment/network/storage privacy, actual UI email
  verification/TOTP enrollment/lost-device backup code, account switching
  concealing/removing previously displayed recovery codes, and explicit recipient/
  client approval before captured invitation delivery and acceptance. HTTP local cookie
  HttpOnly/SameSite=Lax verified; hosted Secure/proxy behavior is not claimed.
* **Earlier real database regressions passed:** Stage03 9 scenarios; Stage04 9;
  Stage05 5; Stage06/07 11; Stage08 1 (model mocked); Stage09 6; Stage10 9;
  Stage11 runtime6/matrix9; Stage12 11; Stage13 11; Stage13A11. Repeated no-write
  reports/snapshots and idempotent legacy adoption still reconcile. Prior Chrome
  suites passed in the initial full run: isolation9, agency9, specialists7,
  platform7. Focused retries preserved this distinction.
* **Offline regressions passed:** 372 general,115 Internal,40 source/index.
  Python unittest discovery reports185 tests,9 optional skips. These include mocks
  and fixtures, not live provider checks. Official repository lint and changed-file
  test lint pass, as does the full Next16.3.3 production build with remote .env
  values shadowed and an unreachable synthetic build DSN.
* Exploratory `eslint .` failed on a pre-existing ignored React bundle (15 errors)
  and existing tests/openrouter-setup.test.mjs (1 error), plus1 existing warning.
  These are outside the configured npm lint target, which passes. No unrelated
  files were changed to conceal them.

Earlier local attempts caught and fixed a row-lock permission grant, fixture OTP
conversion/APIError assertions, an ambiguous SQL local name, a browser origin/
locator fixture issue, and a real same-document email-fragment reopening issue.
Final checks above pass; failures are not relabeled as completed runs. Acceptance
databases/servers were stopped and removed. A separate synthetic review is retained.

### Private review and setup

**Login:** http://127.0.0.1:3003/login

**Security:** http://127.0.0.1:3003/account/security

**Invitations/agency staff:**
http://127.0.0.1:3003/admin/agency/staff?agency=s13-harbor

**Platform:** http://127.0.0.1:3003/platform

**Recovery:** http://127.0.0.1:3003/account/recovery

The private ignored **.tmp/auth-review/accounts.json** contains accounts.ownerA
(agency owner), ownerB (other agency), platformOnly (synthetic Platform Owner),
ordinary staff/client and specialist identities. Use the chosen account's
username/password, then import its private totpURI into an authenticator or select
Use a recovery code and enter one unused backupCodes item. Real users must do
their own setup; never paste any password, OTP, seed or recovery code into chat.
Private capture messages are under .tmp/auth-review/mail. No public inbox exists.
Sign in as the intended recipient before opening/accepting an invitation link.

The new **.env.auth-review** contains generated DATABASE_URL (ordinary runtime),
AGENCY_MIGRATION_DATABASE_URL (operator only), BETTER_AUTH_URL (3003),
BETTER_AUTH_SECRET, PORTAL_ACCOUNT_SECURITY_ENABLED=true, AUTH_MAIL_MODE=capture
and AUTH_TEST_MAIL_DIR. No local test configuration is missing. The launcher strips
operator/provider settings from Next and never starts source/provider workers.
See the Stage14 runbook for migration ordering, fresh fixture requirements,
repeat commands and refusal to overwrite accounts. Do not run destructive
acceptance tests against this retained review or load .env.local for tests.

Only PORTAL_ACCOUNT_SECURITY_ENABLED, AUTH_MAIL_MODE and AUTH_TEST_MAIL_DIR are new
blank .env.example names. Set privately in the isolated test profile; do not copy
these synthetic DSNs or secrets to Vercel. Real transport/provider/sender settings
are not selected/implemented, so no unused provider variable was invented.

### Remaining checks, blockers and resume

No local Stage14 verification blocker remains. Live mail delivery, verified sender
domain and approved callbacks/recipients need a selected service and a separately
authorized integration/live check. Legacy synthetic-email identities need approved
real-email enrollment. Lost-device backup codes work; all factors lost needs an
approved identity reproof/operator procedure before privileged production use.
No automatic reset/impersonation bypass was added. Hosted HTTPS cookie/CSRF/proxy
trust, auth backup/key rotation/restore and deployment migration rehearsal remain
pending. Capture rejects real recipients and remote databases by design.

Carry forward critical hosted-AI/privacy and deployed private CDN/cache checks;
external agency access stays HOLD. Deployed role/pooler mapping, provider consent/
resource/revocation, scheduler delivery, secret rotation/restore and supported
browser/real BFCache coverage remain pending deployment checks. Google revocation
keeps the existing next-check /15-minute freshness boundary. Stage20B instruction
publication approval remains later. No live provider sign-in/consent was needed.

Resume from this local Stage14 commit only after a separately supplied next-stage
task, with an approved disposable target. **Stop before Stage15. No push, live
invitation, real personnel/customer access, paid action or Neon write.**

## Stage 15 closeout — 2026-11-19

**Stage15 local engineering complete. External agencies, non-AOC client mode and
custom-host activation remain HOLD. Stop before Stage16.** Baseline d3999df on
feat/agency-platform in C:\Users\MY PC\Desktop\AI\portal. Initial interrupted
state contained only this task's sharp dependency-manifest edits; prepared code
was still under the ignored original-workspace .tmp/stage15/src mirror. All final
code and checks now use actual AI\portal paths. No existing edits, prior handoff
or private review profiles were overwritten. Final local commit is git log -1.

### Implemented/reused

Agency Owner branding reuses the existing admin shell/sidebar, login, account
controls and scoped admin data. Portal/report/legal/support identity, validated
public raster logo, four accessible colors and optional attribution are separate
from client AI greeting/accent/instructions/model/provider/source configuration.
Owner preview then explicit save, server scope/MFA/revision checks and audit keep
presentation changes within one agency. AOC software/platform ownership is intact.

Explicit /portal/<slug>/<screen> local routes show fictional Harbor Studio and
Summit Collective. Branding does not grant membership: agency/client/platform and
specialist permissions remain independent. Existing external gates stay closed.
Login/MFA/recovery/verification/logout destinations retain the chosen brand;
branded invitation acceptance rejects a substituted agency without consuming the
link. Host remains exact canonical, mismatched forwarded hosts reject, host-only
cookies remain; local route brands share same-origin auth with fresh permissions.

Public logo storage is separate from private files; uploaded PNG/JPEG/WebP is
decoded and re-encoded metadata-free using installed sharp0.35.4, pinned directly.
SVG/HTML/malformed/oversized/animated/remote logos reject. Both text color pairs
require4.5:1. Responsive components and text fallbacks are reused. Supported
authorized agency CSV/JSON and Website Insights CSV/JSON get permitted identity;
no new PDF generator or live analytics read was introduced.

Domain requests reserve normalized globally unique names. The platform-owner
read-only inspection path uses the supported fixed Vercel API and rechecks ticket
generation/status after response. Provider claims cannot set another agency's
domain. Real registration/DNS/TLS remain pending; even fixture-verified results
return routingEnabled:false. No custom host or trusted-origin wildcard was enabled.

### Files

| Area | Primary project paths |
| --- | --- |
| Migration / policy | database/agency-platform/012_agency_branding.sql; scripts/migrate-agency-branding.mjs; lib/agency-branding-policy.js; agency-branding.js; agency-domains.js; agency-logo.js; brand-callback.js |
| Routes | app/portal/[slug]/[screen]/page.js; app/api/admin/agency/brand/route.js; app/api/portal-brand/[slug]/logo/route.js; app/api/platform/domains/route.js; existing account/invitation/Website Insights APIs and proxy |
| UI | components/agency/brand-frame.js; branding-editor.js; branding.module.css; existing agency console/page, admin shell/sidebar, login/account/sign-out controls |
| Auth / export reuse | lib/auth.js; auth-mail.js; invitation-links.js; agency-administration.js; website-insights/presentation.js; host-only cookie policy |
| Review/tests | scripts/agency-branding-fixture.mjs; seed-branding-review.mjs; check-branding-review.mjs; guarded dev-platform-review.mjs; next.config.mjs native trace; tests/agency-branding.test.mjs; tests/agency-backfill/branding.database.test.mjs; tests/agency-branding/*; existing Website Insights fixture adapter; package.json/package-lock.json |
| Handoff/config | STAGE15_AGENCY_BRANDING.md; CONTEXT; DECISIONS S15-D01–03; ISOLATION-EVIDENCE; PROGRESS; blank .env.example hosting-check names |

### Actual results

* **8/8 Stage15 database/API TAP checks**, no skips, on new disposable WSL PG18.3
  with separate operator/ordinary guarded runtime. Migration012 applied twice.
  Two-agency/owner/staff/client denial, no partial bad save, stale revision,
  scoped exports, PNG delivery, RLS/pool reuse, domain collision/caller denial,
  mocked-provider revocation race, branded recovery and suspension all pass.
* **7/7 Chrome branded scenarios** on the final full production build. Distinct
  names/logos/palettes,390px mobile/no overflow and actual computed button color;
  branded login/MFA/nav/logout; read-only preview until save, invalid colors/logo;
  authorized multi-membership switching/report identity; safe recovery callback;
  unknown/unverified/spoofed host, origin and host-only cookie checks; mismatched
  invitation brand denial then correct-brand acceptance. No real provider/delivery
  or hosted cross-domain SSO/cookie behavior is claimed.
* **Stage14 regressions:**16/16 real DB/provider checks and8/8 Chrome scenarios
  repeated before012. Stage14's earlier7/8 typo above was corrected against its
  recorded final8-pass run and this repeat; no failed run was relabeled.
* **Earlier database regressions:** Stage03 9 scenarios; Stage04 9; Stage05 5;
  Stage06/07 11; Stage08 1 real DB/model mocked; Stage09 6; Stage10 9;
  Stage11 matrix9; Stage12 11; Stage13 11; Stage13A11. No-write report/snapshot and
  idempotent legacy adoption still reconcile. The historical6-case role/older
  browser matrices retain their prior status, not a claim of new Stage15 runs.
* **Offline:**378 general,115 Internal,40 source/index tests pass. Python reports
  185 tests with9 opt-in skips. Website Insights brand adapter is a clearly labeled
  authorized-context/report fixture, not a live analytics/provider check.
* **Official repository lint and focused changed-file/test lint pass. Full
  Next16.3.3 production build passes** with private .env assignments shadowed and
  unreachable synthetic build database, excluding Neon/provider access.
* Fictional public mobile/desktop screenshots were inspected privately. Visual
  review found a remaining AOC gradient/button override; fixed palette propagation
  and added computed-theme regression. The save notice now survives the server
  revision refresh. Browser execution caught a Turbopack sharp
  external-import failure despite an earlier passing build; native Node loading
  fixed it. Narrow output tracing includes62 sharp/native-related files and21
  @img assets in the upload handler trace, and Chrome performs a valid PNG
  preview/upload/save. A target-platform deployment is still pending. An obsolete review health-check cookie method was corrected to the
  supported sign-out API. Final checks above pass; early failures are not ignored.

Acceptance server/database were stopped/removed. A separate fresh synthetic review
was prepared after the final build. Runtime-role diagnostic and both synthetic
owners' MFA/login/own-brand APIs/foreign denial passed. Source mirrors, profiles,
accounts, canaries, mail, logs and screenshots are excluded from Git.

### Local review and private setup

**Harbor login:** http://127.0.0.1:3004/portal/s13-harbor/login

**Summit login:** http://127.0.0.1:3004/portal/s13-summit/login

**Harbor branding:** http://127.0.0.1:3004/portal/s13-harbor/branding

**Summit branding:** http://127.0.0.1:3004/portal/s13-summit/branding

Both share existing components on the same review server; no separate source
copies. Private .tmp/branding-review/accounts.json: accounts.ownerA for Harbor,
accounts.ownerB for Summit. Use username/password then its private authenticator
totpURI or an unused backupCodes entry through Use a recovery code. Credentials,
OTP/seed/recovery codes stay out of chat. Use separate browser profiles when also
reviewing older ports, because cookies are host-based rather than port-based.

New .env.branding-review uses generated DATABASE_URL (ordinary runtime), separate
AGENCY_MIGRATION_DATABASE_URL, BETTER_AUTH_URL (3004), BETTER_AUTH_SECRET,
PORTAL_ACCOUNT_SECURITY_ENABLED, AUTH_MAIL_MODE=capture and private AUTH_TEST_MAIL_DIR.
It is not copied from .env.local. The launcher scrubs operator/provider settings
and does not start source/provider workers. Existing ports3000–3003/profiles are
preserved; no application behavior claim is inferred just from a health endpoint.

No local setup name is missing. New live-check names are intentionally unset:
AGENCY_DOMAIN_CHECKS_ENABLED, VERCEL_DOMAIN_TOKEN, VERCEL_DOMAIN_PROJECT_ID,
VERCEL_DOMAIN_TEAM_ID. They are blank in .env.example and belong only in a later
approved server/private setup, never browser/chat. A real named domain/provider
account, scoped project token, correct team, user-completed ownership challenge,
approved legal/brand assets and DNS/TLS deployment rehearsal are prerequisites
for dependent live work. No real consent/sign-in was needed for this fixture run.

See STAGE15_AGENCY_BRANDING.md for supported endpoints, migration/review commands,
private test shell requirements, boundary between verification snapshot and enabled
routing, and exact pending setup. Tests use disposable synthetic data, not this
retained review DB. Do not run them with .env.local or Neon credentials.

### Remaining / next permitted stage

Stage15 local engineering is complete. **Custom-domain live registration,
verification, DNS/TLS, deployed proxy/CSRF/cookie/callback/cache behavior and host
activation remain pending and gated.** Prepared adapter registration/verify writes
were not called. Fixture status is not a claim that a real domain is enabled.

Carry forward critical hosted-AI/privacy and deployed private CDN/cache checks;
external agency rollout stays HOLD. Provider consent/resource/revocation, deployed
runtime/pooler mapping, scheduler delivery, key rotation/restore and supported
browser/real BFCache remain pending. Google revocation retains next-check/15-minute
freshness. Stage14 live mail/legacy real-email enrollment and approved all-factors-
lost recovery remain pending; real email templates/deliverability not claimed.
Stage20B publication approval stays later. No Neon, actual personnel/customer
access, provider upload, real email, paid action, domain purchase or DNS change.

Commit intended changes locally only; no push. **Stop before Stage16.** Resume
only with a separately supplied next-stage task and approved disposable target.


## Stage 16 closeout - useful client portal without Hubstaff (2026-11-19)

Baseline Stage15 **72081fd**, primary **C:\Users\MY PC\Desktop\AI\portal**,
branch **feat/agency-platform**. Read AGENTS, CONTEXT, DECISIONS, Stage15 handoff,
installed Next16 route-handler documentation and DATABASE_PORTABILITY first.
The attached playbook Stage16 matched the explicit request; its later-stage
instructions were not treated as authorization. Initial working tree was clean.
Final application/test/docs changes live in actual project paths, not only .tmp.

### Completed scope / files

* Additive013 client_business_profiles, composite agency/client FK, FORCE RLS,
  session-authorized view/save/evidence functions, effective manage permission,
  optimistic revision, bounded plain-text fields and metadata-only profile audit.
  No legacy identifiers or client/settings records are rewritten by migration.
* Existing agency client creation already permits no project/token and is reused.
  Client Administrators can save/resume optional business setup or complete it.
  Website reference remains distinct from approved browsing and provider consent.
* Unmapped dashboard: business setup, performance evidence, attention, next
  actions and delivered artifacts. Unavailable metrics are not zero; saved
  reports are dated observations, not sales or completed task claims. Hide
  unavailable Hubstaff navigation/polling. Mapped dashboard/budget/task paths stay.
* Work skips project/index requests when no mapping exists; Python freshly loads
  permitted business/report context as untrusted request data. Existing approved
  knowledge, private admin guidance, revision/revocation/privacy guards remain.
  General keeps its no-Hubstaff behavior and receives no business/report payload.
* Reuse Stage15 authorized branding, existing Website Insights/reports/exports,
  Stage14 account controls, workspace switching and role guards. No request/
  approval control, agency rollout, identity promotion or provider credential added.

| Area | Actual project paths |
| --- | --- |
| Schema/operator | database/agency-platform/013_client_business.sql; scripts/migrate-client-business.mjs |
| Profile API/UI | lib/client-business.js; app/api/client/business/route.js; components/portal/business-home.js; business.module.css |
| Dashboard/brand | components/portal/client-portal.js; lib/client-navigation.js; lib/agency-branding.js; app/page.js |
| Chat | app/api/chatkit/route.js; chatkit_backend/app.py; assistant.py; business_context.py; components/ai-assistant/chatkit-assistant.js |
| Fixtures/review | scripts/business-review-fixture.mjs; seed-business-review.mjs; check-business-review.mjs; dev-platform-review.mjs |
| Tests | tests/agency-backfill/business.database.test.mjs; tests/client-business/*; tests/client-readiness.test.mjs; tests/hubstaff-index/chat-routing.test.mjs; chatkit_backend/tests/test_business_context.py; test_stage16_business_database.py |
| Handoff | STAGE16_WITHOUT_HUBSTAFF.md; CONTEXT; DECISIONS S16-D01-02; ISOLATION-EVIDENCE; PROGRESS |

### Actual verification / preservation

**Fresh disposable WSL PostgreSQL18.3 only**, separate operator and ordinary
runtime on verified loopback. No configured Neon connection loaded. The private
scratch orchestration .tmp/stage16/sql.py executes actual AI\portal files;
acceptance cluster/server are removed afterward, separate from retained review.

* **8/8 Stage16 database/API TAP checks**, including the suite parent, no skips.
  Existing agency creation with no Hubstaff; real Better Auth identities;
  paragraph/draft persistence and completion; stale-revision conflict;
  Viewer/Member write denial; same-agency and foreign-agency denial; mass
  assignment and composite FK rejection without partial changes; Website Insights
  saved reports/CSV; scoped business evidence; effective grant downgrade, session
  revocation and agency suspension; direct runtime-table denial and clean pooled
  role; unchanged legacy client rows. A child Python runtime-role test executes
  real business_evidence authorization and denies supplied foreign/revoked scopes.
* **5/5 Chrome scenarios** on the full production build: unmapped dashboard and
  zero Hubstaff requests; saved/resumed/completed onboarding; saved website
  report rendered and CSV authorized, foreign report denied; Viewer read-only and
  390px no overflow; full workspace switching discards foreign profile/report
  state. External /agency stays404. Browser external network requests are blocked.
* **Preservation:**013 applied twice. Full public-table record/sequence snapshots
  immediately before/after migration match. The prior Stage04 dry-runs are
  read-only/identical, public legacy rows preserved through adoption, second apply
  changes no ownership rows. Existing legacy client IDs/project fields compare
  unchanged after profile/site operations. Credit settings, pricing/history,
  conversations/files, resources, approved sources and indexing records are not
  reset; prior credit, mapped budget/task/project ownership and authorization
  regressions below pass. Existing AOC Admin restrictions stay in force; no
  foreign-estate global admin bypass is added.
* Earlier database regressions repeated: Stage03 9 scenarios;04 9;05 5;
  06/07 11;08 1;09 6;10 9;11 matrix9;12 11;13 11;13A11;
  Stage14 16 and Stage15 8. **Stage14 Chrome8 and Stage15 Chrome7** also repeat.
  These are local synthetic checks, not additional live-provider checks.
* Offline: **379 general,115 Internal,40 source/index tests pass**. The proxy
  fixture additionally checks no-project Work forwarding approved canary guidance
  without project calls; General carries no Hubstaff. Python discovery reports
  **188 tests,10 opt-in skips**; the new opt-in Python DB check runs in the real
  Stage16 database suite. Existing internal account/panel protections are retained.
* Desktop/mobile review screenshots were inspected. The last visual check found
  an old Work hint implying Hubstaff context; it now says permitted business
  knowledge and available evidence. That copy-only change was rebuilt/linted and
  checked on the fresh retained review server, after the five functional cases.
* **Official repository lint, changed-file/test lint and full Next16.3.3
  production build pass.** Build shadows private .env assignment names and uses an
  unreachable synthetic database; it does not access Neon or a paid provider.
* Early runs caught and corrected fixture ownership-marker/legacy-trigger
  assumptions, provider-check ordering, textarea accessible labels that included
  saved content, incomplete synthetic report shape and an exact-text website
  selector that ignored its hostname suffix. Final outcomes above are from the
  corrected run; earlier failures were not relabeled. Provider/model/search data
  remain mocked/synthetic; no paid AI answer or live website crawl is claimed.

Commands executed through the sanitized private test shell include migration013
(twice), node --conditions=react-server --experimental-test-module-mocks --import
./tests/internal-user/aliases.mjs --test tests/agency-backfill/business.database.test.mjs;
Playwright --config tests/client-business/playwright.config.mjs; existing Stage03-15
fixture commands; node --test tests/*.test.mjs; Internal/source/index suites;
Python unittest discovery; repository/focused ESLint; Next production build.
Logs/canaries/accounts/screenshots/supervisors stay ignored, not in Git.

### Review / setup / limits

Login **http://127.0.0.1:3005/login**; home **http://127.0.0.1:3005/**;
profile **http://127.0.0.1:3005/?view=business**;
reports **http://127.0.0.1:3005/?view=website-insights**.
Private **.tmp/business-review/accounts.json**, accounts.businessA.username/password
(or businessB, viewer, multi). Use an incognito/separate browser profile because
local ports share cookie scope. No credentials belong in chat. This is an AOC-owned
synthetic client experience; non-AOC client mode is still gated.

The separate retained .env.business-review is generated locally, not copied from
.env.local: DATABASE_URL ordinary runtime, AGENCY_MIGRATION_DATABASE_URL operator,
BETTER_AUTH_URL/SECRET, PORTAL_ACCOUNT_SECURITY_ENABLED, AUTH_MAIL_MODE=capture,
AUTH_TEST_MAIL_DIR. No basic-review setup is missing. Review launcher scrubs
operator/provider values and never starts provider/source jobs. Reports are labeled
synthetic. Seed/migration/health scripts are committed; private profile/accounts
are excluded. See STAGE16_WITHOUT_HUBSTAFF.md for restart/setup commands.

**Live AI remains unverified and intentionally disabled in review.** For a later
approved live check, configure CHATKIT_BACKEND_URL and CHATKIT_BACKEND_SECRET in
Next, matching secret/DATABASE_URL and approved provider settings in Python
(OPENAI_API_KEY or OPENROUTER_API_KEY as applicable), privately. No paid credential
is needed for deterministic authorization tests. Optional PAGESPEED_INSIGHTS_API_KEY
and WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID, WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET plus
WEBSITE_INSIGHTS_ENCRYPTION_KEY (existing Drive fallback) remain server-only live
setup; Google consent is separate. No new variable or .env.example placeholder.

Carry forward **critical hosted-AI privacy and deployed private CDN/cache** checks;
external agency activation remains **HOLD**. Live provider consent/resource/
revocation, ordinary role/pooler deployment, scheduler delivery, secret rotation/
restore, real email/legacy enrollment/lost-all-factors policy, custom DNS/TLS/host
activation and supported-browser/BFCache retain prior pending status. Google
revocation remains next-check/15-minute freshness. Stage20B approval is later.
No production/client data, personnel import, provider upload, real email/payment,
DNS or Neon write. Local commit only, no push. **Stage16 local engineering PASS;
stop before Stage16A.** Resume only with a separately authorized next-stage task.


## Saved Stage 16 checkpoint before manual branch switch

**Primary checkout:** C:\Users\MY PC\Desktop\AI\portal.
**Branch:** feat/agency-platform. **Stage16 implementation commit:**
`f6c8babf871cc939e7f25c0787cc05cb77a99dfe`.
All31 changed application, portable migration, test and handoff files were checked
against that commit in the actual project paths. Nothing intended remains only
under a scratch mirror. The tracked working tree was clean before this note.
This documentation-only checkpoint follows the implementation commit; its commit
is the current `git rev-parse feat/agency-platform` after saving this note.

### Verified results and remaining boundaries

The saved Stage16 evidence and local logs were rechecked:8 database/API TAP
checks (including suite parent),5 Chrome business scenarios,379 general Node,
115 Internal,40 source/index tests; Python188 reported with10 opt-in skips.
The new opt-in Python database check ran within the actual disposable database
suite. Stage14 Chrome8 and Stage15 Chrome7 also passed, alongside the earlier
recorded database matrices. Migration013 applied twice, and public-table records/
sequences reconciled unchanged. Repository/focused lint and full production build
passed; the final Work/General copy was checked in the fresh review browser.
Model/provider responses and website observations were synthetic/mocked, not live
AI/provider verification. No tests/build/migrations were rerun for this note.

Pending critical external-release checks remain hosted-AI privacy and deployed
private CDN/cache behavior. External agency access stays HOLD. Carry forward live
provider consent/resource/revocation, deployed ordinary runtime/pooler roles,
scheduler delivery, rotation/restore, real email/legacy enrollment/lost-all-factors
policy, custom-host DNS/TLS/activation and supported-browser/BFCache checks.
Google revocation still has the documented next-check/15-minute freshness bound.
Stage20B publication approval is later. No new setup variable is introduced;
server-only live setup names and private locations remain in
STAGE16_WITHOUT_HUBSTAFF.md. No prerequisite is needed merely to save this checkpoint.

### Review shutdown and private local state

Verified supervisor/launcher/listener ancestry against the AI\portal target before
requesting the existing graceful shutdown for the six review sessions: Stage12
platform3000, Stage13 agency3001, Stage13A specialist3002, Stage14 security3003,
Stage15 branding3004 and Stage16 business3005. All six report stopped; recorded
launchers/listeners exited and no listeners remain on ports3000-3005. Other
applications/processes were not targeted. Their owned disposable PostgreSQL
helpers performed normal temporary-fixture cleanup; Neon was never contacted.
The historical review links above are now OFFLINE, not currently running services.

Source changes, ignored private environment/account files and other local files
were preserved. No environment file or database configuration was edited, and no
migration, production write or new test fixture was started during checkpointing.
The retained private review profiles refer to stopped disposable targets; do not
assume those database URLs/accounts are a live review environment after resuming.
Keep all .env files, private credentials, mail, screenshots, logs and .tmp artifacts
out of Git and out of any ordinary source transfer. No branch switch, push,
reset/clean/discard or next-stage work was performed.

### Resume in playbook order

1. Return manually to **feat/agency-platform** in this checkout when ready to
   continue development. Confirm `git branch --show-current`,
   `git rev-parse feat/agency-platform` and `git status --short`; the branch tip
   must include f6c8bab and this checkpoint. Preserve any subsequent local edits.
2. Read AGENTS.md, CONTEXT.md, DECISIONS.md, this latest PROGRESS entry,
   ISOLATION-EVIDENCE.md and STAGE16_WITHOUT_HUBSTAFF.md before editing. Recheck
   dependencies and private test-target identity on the computer being used.
3. **Stage16A - Role profiles and guided delivery onboarding is next.** It has
   not started and needs a separately authorized task. Reuse existing Stage16
   business setup and earlier membership/specialist controls; do not skip to17.
4. Before any future test writes, establish and verify a fresh approved disposable
   PostgreSQL target with synthetic data. Follow the existing Stage03-16 runbooks
   and private test-shell setup. Preserve/archive obsolete private review profiles
   deliberately before generating replacements; never fall back to configured
   Neon or copy credentials into chat. No database preparation is part of this
   checkpoint. Request named live-provider sign-in/consent only when required.
5. After separately completing Stage16A, follow **Stage17 - Requests, approvals
   and action center**, then the remaining playbook stages in order. Keep
   external agency mode closed until its critical release evidence is complete.

Master exists locally and is not checked out in another worktree. No untracked
public source files or private-file collisions with master were found. After the
checkpoint commit and clean-status confirmation, a normal manual branch switch
is safe as a Git operation. Ignored environment/build files stay local across
branches; review their target before starting an application on another branch.
This stage stops here; no Stage16A or Stage17 implementation is authorized now.
