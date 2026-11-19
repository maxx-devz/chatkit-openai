# Stage 11 isolation evidence

Recorded **November 19, 2026 (Asia/Shanghai)** in
`C:\Users\MY PC\Desktop\AI\portal`, branch `feat/agency-platform`, starting
from the clean Stage 10 commit `d3c9991`.

**External agency rollout: BLOCKED.** Local checks passed after the fixes below.
This is not production isolation certification or permission to invite agencies.
`/agency` and `/api/agency`, including descendants, still return 404. No exception,
environment bypass, new administration route or production migration was added.
Stop before Stage 12.

Status words describe the actual evidence: **passed**, **failed**, **mocked**,
**blocked**, **not run**. A mocked provider result is not a live-provider pass.
The historical failed rows below have explicit fixes and passing regressions.

## Environment and safety

| Item | Observed result |
| --- | --- |
| Branch/baseline | `feat/agency-platform`; `d3c9991`; initial tree/index clean |
| Node / Python | 22.22.2 / 3.13.17; Python `pip check` found no broken requirements |
| Installed packages | Next.js 16.3.3, React 19.2.8, pg 8.23.0, Playwright 1.63.0, ESLint 9.39.5, cheerio 1.2.0 |
| Browser | Installed Google Chrome 157.0.8103.79, headless desktop, real portal production build |
| Database | New disposable PostgreSQL 18.3 cluster in Ubuntu WSL, loopback only, random port, synthetic Stage 04 archive and accounts |
| Identity/target verification | Verified local server data directory/port/login and actual database name before writes; separate operator and ordinary application logins; test code rejects non-loopback or non-disposable names |
| Runtime configuration | Private `.env*` names were shadowed before Next startup/build; only synthetic loopback database/auth settings were supplied. No `npm run dev` or provider watcher was started against `.env.local` |
| Production safety | Neon was not connected to or changed. No real payment, message, provider consent, AI request, client-document upload, external task update, deployment or push |
| Cleanup | Local Next process terminated; disposable WSL cluster stopped and temporary database data removed |

The existing local synthetic archive and installed WSL binaries were available;
no dependency installation was necessary. Credentials were generated privately
for this rehearsal. The browser fixture JSON contains synthetic passwords and
cookies and is deliberately ignored, outside public application assets and Git.
Tests do not take credentials from the user's real account or ask for passwords.

## Fixture and permission matrix

Agency A is the synthetic adopted AOC workspace. Agency B is fictional Harbor.
These are disposable records, not real customer tenants. Old regression fixtures
can leave additional synthetic records; the Stage 11 matrix below is the four
explicit clients under test.

| Client | Workspace | Purpose |
| --- | --- | --- |
| A1 | Agency A / Orchid (`501`) | A1 library, private assistant file/thread, website/report and distinct source canary |
| A2 | Agency A / Birch (`502`) | Same-agency unassigned-client checks and authorized workspace switching |
| B1 | Agency B / Pine (`1101`) | Cross-agency denial, explicit B source canary and restricted DB positive read |
| B2 | Agency B / Cedar (`1102`) | Same-agency B client separation and distinct source canary |

| Synthetic identity | Explicit grants | Expected boundary |
| --- | --- | --- |
| A client administrator / agency administrator | A1 manage | Manage A1; no A2 or B client access by agency role alone |
| A staff member / client Member | A1 contribute | Assigned A1 agency helper/read/contribution succeeds; other clients deny |
| A Viewer | A1 read | Library reads succeed; direct mutations deny regardless of request role fields |
| A2 administrator | A2 manage | A2 succeeds; A1 private resources deny |
| B staff member | B1 contribute | Scoped DB access succeeds; current public client portal stays gated |
| B2 administrator | B2 manage | B2 scoped DB read succeeds; B1 and Agency A resources deny |
| Multi-agency staff user | A1, A2 and B1 contribute | Explicit selection among granted workspaces; B2 and platform privilege deny; B1 portal remains gated |
| Unrelated user | None | No workspace or private resource access |
| Platform operator | Active operator, no client grant | Narrow platform-operator authorization succeeds; not a client or Internal identity. Broad legacy Admin retains its all-AOC estate restriction |

Two restricted database LOGINs were separately bound to the agencies and tested
with `max:1` pools and the real `withAgencyScope` helper. Actor/client context
comes from trusted server authentication; these are not credentials for browser
database access.

## Executed matrix

| ID | Surface and case | Status | Evidence / limitation |
| --- | --- | --- | --- |
| API-01 | Real signed-in A1/A2 reads, file downloads and JSON/CSV report exports | passed | Actual Better Auth sessions, application routes and PostgreSQL rows; exact own canary returned |
| API-02 | Every matrix identity supplies another client's file/report IDs, including same-agency IDs | passed | Forbidden/not-found responses with no foreign canary; B's own HTTP access is separately gated |
| API-03 | Staff tries an unassigned client; multi-agency user selects permitted and unrelated workspaces | passed | Narrow agency helper and selection endpoint intersect live memberships/assignments; supplied role fields do not confer platform privilege |
| API-04 | Viewer direct write, Member mass assignment, foreign deletion | passed | Denied with unchanged row count/target; authorized Member contribution saved to A1 |
| API-05 | Unknown host and conflicting/foreign URL selectors | passed | Real HTTP proxy/DAL deny without fallback to AOC |
| UI-01 | Chrome username/password login and authorized library UI | passed | Actual portal, real synthetic accounts and database; no mocked auth/API response |
| UI-02 | Viewer read UI and forbidden direct mutation | passed | Read content visible; contribution button absent; server denies direct POST |
| UI-03 | Multi-workspace switch, old tab submits A1 form after selecting A2 | passed | Patched old tab receives 409; A2 row count unchanged; new document/list shows A2 |
| UI-04 | Sign-out, different account sign-in, browser Back through earlier history | passed | Earlier A1 document not restored as A2 content; copied A1 link returns 404 |
| UI-05 | Membership loss and deleted session in an already signed-in browser | passed | Next copied-link request denies; reloaded page omits canary; revoked session returns 401 |
| UI-06 | Website Insights request carries its page's client and loads its own saved report | passed | Chrome observes `x-aoc-client`; selected fixture site/report only; no Google or crawl run |
| UI-07 | Agency B portal and public agency route gate | passed | B login has explicit not-enabled state; all tested agency route forms return 404; private platform APIs deny |
| UI-10 | History/account change with request routing disabled | passed | CDP blocked external HTTPS/WSS; previous account content absent; same-session and post-account-change pageshow persisted flags were false |
| UI-08 | Authorized B end-to-end portal administration/client workflow | blocked | Deliberate gate remains. B's scoped DB/source reads are not a substitute for a working B portal |
| UI-09 | Genuine BFCache hit after account revocation; Safari/mobile cache variants | not run | A separate routing-disabled attempt observed persisted=false in all measured restores; a genuine BFCache hit was not obtained. Safari/mobile variants were not run |
| DB-01 | Restricted A/B LOGINs, two clients each: own read and foreign/sibling read | passed | Actual RLS/scoped resolver: own record returned, all other matrix canaries absent; raw legacy table access denied for these restricted LOGINs |
| DB-02 | Pooled reuse after commit/rollback, foreign agency selector and mismatched ownership | passed | New matrix plus Stage 03/04/10 real PostgreSQL regressions; clean context after release; FK mismatch rejected |
| DB-03 | Actual shared app role reads protected job/connection ledgers | passed | Direct SELECT denied; non-owner runtime and non-login owner verified by migrations/role checks |
| DB-04 | Actual shared app role raw legacy-table privilege audit | passed | Audit deliberately confirms this privileged service login **can** read a B legacy row. It is not tenant-restricted RLS; see the explicit trust boundary below |
| DB-05 | Claim that all legacy data is protected by tenant RLS from the shared app credential | blocked | Unsupported by current architecture. Do not represent DB-01 or protected ledgers as global legacy-table RLS |
| FILE-01 | Copied authenticated download URL under another client/account or after membership/session revocation | passed | Real HTTP/DB checks; no bearer-only signed URL is issued in this path |
| FILE-02 | Private assistant asset under another author in the same client | passed | Author succeeds; other Member receives 404; existing attachment/thread scope fixtures also rerun |
| FILE-03 | Traversal-like filename, private caching and executable-content delivery protections | passed | Filename sanitized; private/no-store and sandbox delivery checked; existing Stage 07 size/type/expiry tests remain in regression suites |
| FILE-04 | Live CDN/cache edge behavior and deployed private-file revocation | not run | Local header assertions do not prove edge configuration or a deployed cache cannot replay a private response |
| AI-01 | Four distinct client source canaries; A guidance never inherited by B | passed | Actual encrypted database source cache and permission/revision checks. B sources were explicitly inserted and reviewed by the synthetic fixture, not inherited from a subscription |
| AI-02 | Source disabled or instruction revision changed | passed | Subsequent retrieval stops; unapproved settings deny; Stage 20B approval-writing workflow remains absent |
| AI-03 | Untrusted instructions embedded in source text | passed | Excerpt stays data rather than trusted instruction text; server-side scope checks remain independent |
| AI-04 | Reopened conversation and same-client foreign author's thread mutation | passed | Own thread listed; foreign/client/author records omitted or denied; foreign title remains unchanged |
| AI-05 | Python tool/stream/attachment membership and foreign-ID guards with real database | mocked | Stage 06/08 fixtures use real authorization rows but controlled ASGI/model/tool transport. No live model or hosted ChatKit iframe session |
| AI-06 | Live AI generation, hosted conversation reopen, streaming and provider-side content/cache isolation | not run | Critical production privacy boundary remains unverified; no paid AI call authorized for this rehearsal |
| CONN-01 | Wrong agency/client reconnect, callback replay, refresh/disconnect race, role loss during exchange | mocked | Stage 09 fixture rerun: actual sessions/transactions/encryption, mocked Google responses |
| CONN-02 | New B identity reads/replaces AOC provider, Make or Drive settings | passed | Actual role/route checks deny; B has no connection binding; restricted DB role cannot read raw credentials |
| CONN-03 | Make connection-test destination and approved payload | mocked | Existing fixed-payload/destination tests rerun; no real webhook message, agency workflow or inbound delivery feature |
| CONN-04 | Real OAuth consent/resource access, refresh and remote revocation | not run | User must name the test account, resources and redirect URLs before sign-in/consent; exact scopes/settings remain in STAGE09_CONNECTIONS |
| JOB-01 | Replay, expired/replaced lease, concurrent capacity, retry ceiling and recovery | passed | Stage 10 real PostgreSQL fixture rerun, including replacement process and five-job capacity; provider work itself mocked |
| JOB-02 | Foreign client job, mid-processing suspension, mapping/connection version change, cancelled/timeout work | passed | Current execution guards and lease writes deny; no cross-agency result/duplicate report row |
| JOB-03 | Real cron delivery/producer authentication on the intended deployment | not run | Handlers and bearer rejection tested locally; no external scheduler dashboard/target verified |
| SUPPORT-01 | Separately approved, time-limited support status access and audit/revocation | passed | Stage 05 real database/session fixture rerun; no implicit client access from operator status |
| INTERNAL-01 | Independent Internal account, role and panel protections | passed | 115 tests passed; Internal application code unchanged |
| OPS-01 | Managed-secret rotation, restore and deployed runtime-role configuration | not run | Local role/ciphertext fixtures do not prove deployment secret custody or rotation rollback |

No unresolved unauthorized-access failure remains in the executed application
matrix. This is a bounded test set, not exhaustive proof over every possible
request or future feature. Reuse the [Stage 06 entry-point inventory](STAGE06_ENTRYPOINTS.md)
and repeat affected checks when later stages add routes, providers or delivery.

## Failures found and changes made

| Finding | Before fix | After fix |
| --- | --- | --- |
| F11-01: stale document form follows newly selected cookie workspace | failed: Chrome observed HTTP 201 after A1's old form was submitted with A2 active; the write went to A2 | passed: requests carry the original page's `x-aoc-client`, server returns 409 and A2 count is unchanged |
| F11-02: Website Insights omits document client binding | failed: Chrome observed no `x-aoc-client` header | passed: all component requests carry its client; obsolete/aborted reads cannot repopulate state |
| F11-03: two recorded effect lint errors | failed: baseline synchronous state changes in effects | passed: initial/detail loads commit state from async responses; site-selection handlers clear obsolete state; affected-file ESLint passes |

`client-documents-panel.js` now binds list/add/remove requests and aborts its
obsolete list read. `website-insights.js` binds requests, checks cancellation
after decoding responses, and clears report/history/connection state when a site
selection changes. Existing server permissions and role differences are reused.
No production schema or Internal feature was changed in this stage.

Fixture-only failures were also corrected: shared-pool double cleanup, a duplicate
grant already created by adoption triggers, a Next request-context module used
outside its HTTP runtime, and ambiguous DOM labels/headings. Tests select the
valid Stage 11 saved report rather than minimal old authorization-only report
fixtures. Browser cases clear only their disposable `rateLimit` rows between
independent cases; the real application's five-attempt login limit was preserved.
Initial harness failures are not reported as passing security evidence.

## Database trust boundary and revocation window

The actual ordinary **shared application service** login retains direct legacy
table privileges. The matrix intentionally demonstrated a raw SELECT returning a
B library row under that service credential. This is the documented Stage 04
trusted-service exception, not a hidden RLS pass. Browser/user requests must go
through the authenticated DAL; exposing that credential or an arbitrary SQL
endpoint would bypass the legacy application boundary. Owner/BYPASSRLS credentials
must never be used by tenant requests.

The separate agency LOGINs cannot raw-read legacy tables and must use the scoped
resolver; agency metadata, new ledgers and owner-controlled approval records use
their tested policies/functions. Actor IDs are established by the trusted server,
not authenticated as separate database users. Neither layer is a license for
browser database access or Supabase's public Data API.

External rollout needs explicit security acceptance of this service trust model
and deployed-role verification, or a separately reviewed tightening of the legacy
paths. Stage 11 does not silently replace every legacy query/RLS policy or break
the existing Internal/Admin subsystems to manufacture a broader claim.

Library/generated-file URLs require live session and scope checks per request;
no previously issued bearer URL stays independently valid until an expiry. A
committed membership/session revoke denied the next tested request. Already
downloaded bytes or a previously rendered authorized document cannot be recalled.
Google-side revocation still has the documented next-provider/source-check or
15-minute freshness discovery window. Database-side revocation/version changes
are checked at the next tool/job/delivery checkpoint; an in-flight external call
may finish but must not publish under lost authorization.

## Reproduction and commands

All test commands must run from this checkout with a privately configured,
approved **disposable loopback** target. Do not use the scripts that load the
existing `.env.local` against its configured Neon database.

1. Read AGENTS, PROGRESS, STAGE03_DATABASE, STAGE04_REHEARSAL, STAGE09_CONNECTIONS
   and STAGE10_JOBS. Check the branch, local edits, Node/Python versions,
   `python -m pip check`, installed Chrome/Playwright and local PostgreSQL.
2. On this workstation, the ignored `.tmp/stage11/sql.py` rehearsal wrapper
   recreated a fresh WSL cluster and restored the approved synthetic Stage 04
   archive. The wrapper/archive/private credentials are not transferred in Git.
   On a fresh computer recreate the synthetic legacy database using the versioned
   `prepareLegacyFixture` export in `tests/agency-backfill/fixture.mjs` and the
   Stage 03/04 runbooks; never substitute a production dump.
3. Privately configure the same disposable database's operator/test URLs and a
   distinct runtime URL. Apply the Stage 04 backfill and migrations 003/004, seed
   actual Better Auth test sessions, then run the ordered workspace, entrypoints,
   sources, connections and jobs fixtures. Source/connection fixtures perform
   their documented migrations 005/006; jobs applies 007 twice. These earlier
   fixtures are stateful and require their documented fresh setup/order.
4. Supply an ignored private fixture JSON path for the new database matrix.
   `isolation.database.test.mjs` adds the four clients/identities above, tests
   real application authorization and writes only synthetic browser credentials
   to that path. Run:

   ```powershell
   npm run test:agency-isolation:database
   ```

   Its underlying command uses `--conditions=react-server`, experimental module
   mocks and the existing alias loader. The test refuses a non-loopback or
   mismatched disposable database. It is skipped, not passed, without its opt-in
   database setting.
5. Build with all private `.env*` assignments shadowed, an unreachable synthetic
   loopback database and synthetic auth settings. Start **only** Next.js on the
   loopback origin recorded by the synthetic fixture; do not start local source
   workers. Supply the ordinary app URL, never the owner URL, to the server.
   The recorded rehearsal used the actual production build with provider settings
   blanked. Normal cases blocked non-local requests with browser routing. The
   separate cache attempt removed routing and blocked external HTTPS/WSS via CDP.
6. With the same private fixture/test configuration, run:

   ```powershell
   npm run test:agency-isolation:browser
   node --test tests/*.test.mjs
   node --conditions=react-server --test tests/hubstaff-index/*.test.mjs tests/drive-sources/*.test.mjs
   npm run test:internal-user
   .venv\Scripts\python.exe -m unittest discover -s chatkit_backend/tests -p "test_*.py"
   ```

   Run Python offline with database/provider environment excluded; its opt-in DB
   tests also run through the earlier scoped fixtures. Run ESLint on all changed
   JS/MJS files and `git diff --check`. Stop the server and dispose of the cluster.

| Check | Recorded result |
| --- | --- |
| New Stage 11 database/API/source matrix | 8 scenario groups, **9 TAP tests passed**, no failure/skip |
| New actual Chrome/HTTP matrix | **9 passed** |
| Existing top-level Node tests | **367 passed**, no failure/skip |
| Existing source/Hubstaff index tests | **40 passed**, no failure/skip |
| Existing Internal Portal tests | **115 passed**, no failure/skip |
| Offline Python suite | 180 tests reported, **8 opt-in skips**, exit 0; not 180 live provider checks |
| Earlier real-database regressions | Stage 03 nine scenarios; Stage 04 two identical no-write dry runs/two idempotent applies plus 9 application TAP checks; Stage 05 five; Stage 06/07 eleven; Stage 08 source/tool/stream fixture; Stage 09 six; Stage 10 nine all passed |
| Build | Full Next.js 16.3.3 production build passed with private values excluded |
| Lint | Changed JS/MJS files passed, including both formerly failing Website Insights effects |

This file records reproducible cases and outcomes; ignored raw logs/screenshots
are local working evidence, not committed credentials or production screenshots.

## Private setup and critical rollout decision

| Configuration name | Private location / purpose | Current local state |
| --- | --- | --- |
| `AGENCY_MIGRATION_DATABASE_URL` | Migration/operator shell only for approved disposable PostgreSQL | Absent/empty in `.env.local`; generated for rehearsal |
| `AGENCY_WORKSPACE_TEST_DATABASE_URL` | Same disposable fixture's administration/test shell | Absent/empty; generated for rehearsal |
| `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | Matching synthetic runtime/auth in isolated child processes | Rehearsal overrides supplied; existing private deployment values not used |
| `AGENCY_ISOLATION_FIXTURE` | Test-only absolute path ending in `.tmp/.../isolation-fixture.json`; never browser/public assets | Generated locally for this run; no runtime `.env.example` entry needed |
| `SOURCE_SYNC_SECRET`, `HUBSTAFF_INDEX_SYNC_SECRET` or `CRON_SECRET` | Next.js deployment secret plus named scheduler Authorization header; 32+ characters | Absent/empty locally; deployed scheduler not verified |
| Google/Hubstaff/AI provider settings and encryption keys | Existing server-managed settings; exact names/read scopes in STAGE09_CONNECTIONS | Not used for live checks; no production token queried/decrypted from Neon |

Before any live check, the user must name the approved staging deployment,
database, provider test accounts/resources and redirect URLs. Configure values
privately and let the user complete required sign-in/consent. Never paste
passwords, API keys or migration credentials in chat. No new runtime secret,
storage provider or queue service was introduced; private env files are unchanged.

The following prevent a pilot approval:

- **Critical privacy/security:** live provider/hosted AI conversation and streaming
  behavior, deployed private-file/CDN cache behavior, genuine browser cache
  restore scenarios, deployed runtime-role/secret custody and the documented
  shared-service legacy-table trust boundary require verification/acceptance.
  Fixture passes and UI inspection cannot close them.
- **Operational and producer verification:** no scheduler registration/delivery
  was inspected. This does not by itself grant foreign access, but unattended
  synchronization and target/bearer configuration cannot be claimed working.
  Rotation/restore has not been rehearsed with managed deployment secrets.
- **Deliberately unavailable:** Agency B's positive end-to-end UI/provider flows
  cannot be proven while gated. A separately approved rollout/test plan must
  close the above boundaries before any external invitation. Stage 20B still
  owns publication approval transitions.

Therefore the gate remains closed. Stage 11 supplies local evidence and fixes;
it does not grant external pilot access. Stage 12 is not started and requires
its own instruction. Later features must rerun the affected cases and update
this evidence instead of inheriting a blanket isolation certification.
