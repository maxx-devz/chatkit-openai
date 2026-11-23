# Stage 11 isolation evidence

> Stage 12 local console regression is appended below: local checks pass,
> external rollout stays HOLD. The following Stage 11 review is dated evidence;
> the latest PROGRESS and Stage 12 runbook describe the new console.

> Latest review from `817c314`: **Stage 11 local engineering PASS; external
> rollout HOLD. Stage 12 local development may proceed under the closed gate
> after a separate task is supplied.** The review/classification at the end of
> this file supersedes the earlier broad blocker labels. Original results below
> are retained as dated evidence. No Stage 12 work or external access is enabled.


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


## Stage 11 continuation review from 817c314

November 19, 2026. This review distinguishes a demonstrated local isolation
failure from an unperformed deployment check. A deployment task is not a claim
that the live feature works, and a critical external-release blocker is not an
instruction to stop safe local development behind the existing gate.

### Classification of every remaining finding

| Finding | Classification | Reason and disposition |
| --- | --- | --- |
| Owner, BYPASSRLS or inherited-owner credentials accepted by runtime connectors | **Critical isolation blocker - resolved locally** | Such roles can bypass protected policies. Actual connectors now fail closed for an adopted portal; real Node/Python tests reject them before application SQL. Deployment must use the reviewed ordinary LOGIN |
| Shared legacy service LOGIN can read legacy rows across clients | **Deployment verification task / documented trust contract** | Most legacy tables have no tenant RLS; broad service DML is intentional server authority, not an owner bypass. Checked request/DAL paths supply tenant authorization. Confirm the service credential stays server-only and no raw SQL/Data API is exposed; never claim universal RLS |
| Actual deployed Next/Python role attributes and hosted pooler mapping | **Deployment verification task** | The actual connector paths were tested locally, not against Neon. Run the new diagnostic on a named approved staging target for both services. A failed role check is a critical configuration blocker; there is no guard-disable flag |
| Live hosted AI/ChatKit conversation reopen, stream and provider-side state/cache isolation | **Critical isolation blocker for external release** | Local SQL/tool/transport fixtures do not demonstrate the hosted privacy boundary. Requires a specifically approved live test account/project; no paid or real-document test was run |
| Live private-file/CDN behavior | **Critical isolation blocker for external release** | An edge cache can invalidate application privacy assumptions. Local private/no-store headers and authentication pass, but the real deployment must demonstrate no cross-account private replay |
| Earlier genuine BFCache gap | **Deployment verification task; local investigation completed** | Playwright had disabled BFCache by default. After removing that switch, actual Chrome reported no-store resource and HTTP-only-cookie-change eviction; account history still revealed no prior account. A true persisted restore was not obtained under the current policy. Do not weaken headers merely to obtain a hit |
| Other browser versions, Safari/mobile and future cache-policy changes | **Deployment verification task** | The supported-browser/deployed-cache matrix must be rerun. Current evidence is installed desktop Chrome, not all browsers. A changed policy or observed stale-account restore reopens a critical defect |
| Real Google/Hubstaff resource selection, consent, refresh and revocation latency | **Deployment verification task before enabling that integration** | Database scope and refresh-race fixtures pass with mocked provider responses. Real provider account/resource configuration remains unverified; any observed foreign resource attach would be critical |
| Scheduler registration, bearer/target and actual delivery | **Deployment verification task** | Handler authentication and execution scope are tested. Missing registration affects availability; it does not confer foreign access. Do not claim unattended synchronization works before a named live scheduler check |
| Managed-secret custody, rotation/restore | **Deployment verification task** | Encryption and role checks pass locally; managed deployment configuration and recovery were not changed. Missing rotation rehearsal is not evidence of a cross-tenant disclosure |
| Positive Agency B end-to-end administration/client/provider UI | **Deployment verification task before external release** | Deliberately gated, not a failing permission bypass. Scoped B reads and deny tests are implemented; positive public B workflows must be tested in a separately approved controlled rollout plan |
| Stage 20B publication approval transitions | **Deployment/feature verification task for Stage 20B** | New revisions remain withheld now. No unapproved-publication bypass was found. Do not enable publication transitions without their later implementation/tests |
| Google-side revocation discovery window and already delivered bytes | **Deployment verification / documented semantics** | Next-provider/source check or the 15-minute freshness bound remains. Already downloaded bytes cannot be recalled. This is not a claim of instant remote revocation |

### Actual runtime investigation and fix

[Runtime role guide](RUNTIME_DATABASE_ROLES.md) records the exact code paths,
operator/runtime separation, role setup and read-only diagnostic.

Next DAL calls use `lib/database.js`; Better Auth web/server factories use the
same checked canonical pool by default, including factories without Next cookies.
Python app/preview use `connect_database`. Both inspect actual database session
properties rather than trusting a username in configuration. No production URL
was connected, queried or inferred to be safe from its name.

The guard rejects elevated role membership, owner privileges and leaked SET ROLE
for an adopted database. Node checks each checkout and discards unsafe/error
connections; Python checks each new connection and closes on denial. Explicit
operator CLIs remain separate. No request parameter/environment flag disables
the guard. Pre-adoption legacy compatibility is preserved and is not pilot-ready
agency verification. No schema migration/provider-specific SDK was introduced.

The shared service LOGIN still has intentional raw legacy access. The new guard
prevents an unsafe runtime role from bypassing protected controls; it does not
turn every legacy table into RLS or sandbox malicious trusted server code.
Credential compromise remains outside the authenticated request boundary. This
scope is explicit and is not counted as a foreign-row denial test.

### BFCache attempt and remaining coverage

The installed Playwright bundle included `--disable-back-forward-cache` in its
normal Chromium launch switches. The updated configuration excludes that switch.
The dedicated history test removes request routing, blocks external HTTPS/WSS
through CDP and captures `Page.backForwardCacheNotUsed` diagnostics.

Actual Chrome 157.0.8103.79 returned persisted=false for the same-session restore
and both measured restores after changing accounts. Reported reasons were:

- MainResourceHasCacheControlNoStore
- JsNetworkRequestReceivedCacheControlNoStoreResource
- BrowsingInstanceNotSwapped
- CacheControlNoStoreHTTPOnlyCookieModified

The private document was not restored into the other account. The regression now
requires a no-store diagnostic when no same-session persisted hit is observed.
This is a real protective-eviction result, not a synthetic pageshow event. A true
persisted snapshot branch remains unexercised because the current policy evicted
it; other browsers and a differently configured deployed edge remain unverified.
The application no-store/authentication policy was not weakened.

### Latest actual results

| Check | Status and result |
| --- | --- |
| New actual runtime-role DB matrix | **passed**: 5 scenario groups, 6 TAP tests; actual Node DAL/Auth/Python connectors, read-only diagnostic, privileged rejection, pooled SET ROLE discard, inherited owner, BYPASSRLS and portal relation ownership |
| Existing four-client DB/API/source matrix | **passed**: 9 TAP tests |
| Actual Chrome matrix with BFCache switch removed | **passed**: 9 tests; real app/auth/SQL; protective eviction reasons captured |
| Top-level Node | **passed**: 370 tests, 0 failed/skipped |
| Source/Hubstaff index | **passed**: 40 tests |
| Internal Portal unit regression | **passed**: 115 tests; SQL/SQLite fixtures explicitly mock role guard, not proof of actual PG role safety |
| Python offline | **passed**: 182 reported, 9 opt-in DB skips; separate real role probes ran through the DB matrix |
| Earlier Stage 03-10 real DB fixtures | **passed**: existing dry-run/idempotence, role, client/file, source/tool, OAuth and job regressions rerun |
| Build / affected JS lint | **passed**: full Next production build and lint, with deployment values excluded |
| Live providers, real edge, managed rotation, deployed scheduler | **not run**: categorized above, not represented by fixture results |

The unsafe fixture first demonstrated raw protected-table access after granting
owner membership, then the runtime rejected that same login. The canonical Next
entry point also rejected owner credentials in a fresh process. Python exercised
its real connector against the safe/unsafe credentials. Correcting an unsafe
membership allowed the ordinary role again; no previous safe result was cached.

Initial Internal unit-fixture failures came from mocked/SQLite pools lacking the
new adapter boundary; they were corrected explicitly in those fixtures. Python
fixture operator connections are now separate from guarded runtime connections.
No production Internal feature was changed. Final tests pass.

### Explicit Stage 11 verdict and next permitted work

**PASS for local Stage 11 engineering and the intended server-authorized trust
model. HOLD for external agency access.** The demonstrated privileged-runtime
configuration hole is fixed locally. No unresolved critical local application
failure remains in the executed matrix. This is not blanket RLS certification,
provider certification or external pilot approval.

**Stage 12 local development can proceed after its own task is supplied**, using
recreated disposable PostgreSQL, synthetic identities and the same closed public
agency/non-AOC gates. No Stage 12 work was started. It must preserve these guards
and rerun affected isolation cases as new features are added.

Exact external blockers are the unverified hosted-AI privacy boundary and deployed
private-cache behavior, plus the named staging/runtime/provider checks required
for the features to be enabled. Scheduler and rotation tasks remain deployment
readiness work; they do not freeze unrelated local development. No external
invitation or gate change is authorized by this verdict.

Use existing private DATABASE_URL settings for the reviewed ordinary role in
both services; AGENCY_MIGRATION_DATABASE_URL remains operator-only. The existing
AGENCY_WORKSPACE_TEST_DATABASE_URL and ignored AGENCY_ISOLATION_FIXTURE path are
still required to recreate fixtures. No new runtime secret or .env example value
was introduced. Configure passwords privately; do not paste them into chat.
No Neon query, deployment, real provider request, message, payment or push occurred.
All disposable database/server processes were stopped and temporary DB data removed.


## Stage 12 local console regression — November 19, 2026

Additive console built from `0064754` in actual `AI\portal` project paths. The
closed external gate, Next/Python runtime guards, source revision checks and
legacy Admin restrictions remain intact. Synthetic owner only; no real account
promotion. See [Stage 12 runbook](STAGE12_PLATFORM_CONSOLE.md) and latest PROGRESS.

| Boundary | Status | Actual evidence |
| --- | --- | --- |
| Platform owner/operator versus legacy Admin, agency/client roles and inactive Internal identities | **passed** | Stage 12 real Better Auth/PostgreSQL/API matrix (11 TAP checks including parent); owner/operator read; only owner write; direct ledger access denied; live role/session changes take effect |
| Agency lifecycle, creation, assigned-owner metadata, no inherited knowledge/credentials/client grants | **passed** | Migration first/repeat, idempotent create, malformed/forged field denial, concurrent/stale status conflict, atomic audit; suspended leases/connection generations/support invalidated, history retained |
| Platform metadata and costs | **passed** | No private canaries/keys/source bodies; AOC/foreign costs reconcile separately; unknown cost is preserved; subscription shown unconfigured; no paid/live-provider action |
| AOC delivery inside a mixed estate | **passed** | Active legacy Admin plus explicit AOC agency role allow own-client list/access toggles; foreign update and platform-only actor deny. Existing global Admin guard unchanged |
| Controlled support | **passed** | Distinct requester/agency/client identity checks, both consents, expiry/denial/revocation, revoked assignments, audited status-only result. Seven Chrome workflows include actual separate-account consent UI |
| New console browser workflows | **passed** | 7 installed-Chrome tests on isolated production server with real synthetic sessions; server blocks unauthorized UI/API use |
| Prior Stage 11 browser/database/runtime controls | **passed** | 9 Chrome + 9 four-client DB + 6 actual runtime-role TAP checks repeated; Stage 03–10 fixtures repeated successfully |
| Existing Node/Python regressions | **passed / mocked as specified** | 372 top-level, 40 source/index and 115 Internal tests passed. Python 182 reported, 9 opt-in skips. Source/AI/provider fixture evidence remains distinct from live-provider evidence |
| Full build and full/focused lint | **passed** | Production build with remote env excluded; lint exit 0 |
| Synthetic review setup / assignment CLIs | **passed** | Canonical operator provisioning created new random-password owner/contact and audited explicit assignment on disposable loopback DB; private generated artifact cleaned. Remote/mismatched/query-override refusal checks passed |
| Persistent manual dev-server review / mobile / other browsers | **not run** | Exact local review URL/setup documented; no retained configured manual review database after scratch cleanup |
| Hosted AI, deployed private CDN/cache | **blocked for external release** | Carried critical isolation checks remain unverified; no live provider or deployment was contacted |
| Deployed roles/pooler, provider consent/revocation, scheduler, rotation/restore | **deployment verification tasks** | Previous Stage 11 classification unchanged; any failed safety probe becomes a blocker |

**Stage 12 local engineering: complete. External agency rollout: HOLD.**
Google revocation remains the documented next-check / 15-minute freshness window;
no instant recall or new webhook guarantee. Actual BFCache restored-cache coverage
and browser limitations remain as recorded in Stage 11, without weakened headers.
No real user/password/provider consent, production DB, payment, message or push.
Stop before Stage 13.


## Stage 13 agency administration — November 19, 2026

Base b2d36ce; actual AI\portal project paths on feat/agency-platform. Stage 13
only, with runtime guards/Stage 11 gates preserved. No real agency activation.

| Boundary | Status | Evidence |
| --- | --- | --- |
| Two-agency clients/staff/settings/usage/audit | **passed** | 11 real PG/Better Auth/API TAP checks, including parent; foreign identifiers/fields denied, own scope allowed, delivery assigned-client restriction, owner-only cost view |
| Ownership and last-owner protection | **passed** | Typed/revision-bound transfer, same-agency active target, former-owner privilege loss; deferred constraints reject final-owner deactivation/governance deletion and inconsistent ownership |
| Invitations and stale authority | **passed** | Separate recipient consent, higher-role/foreign-client/unrelated-recipient/duplicate/expired/revoked/downgraded-inviter denial; no mail sent |
| Revoked/stale access and concurrent writes | **passed** | Rechecks session/membership/agency status; reactivation does not restore old grants; per-agency revision lock admits one competing write; no partial denied mutations |
| Protected tables / pool / local gate | **passed** | Runtime direct ledger read/delete denied; no retained SQL role/context; disabled gate and remote target reject; external agency routes remain closed |
| Agency Chrome UI and direct APIs | **passed** | 9 actual production-build scenarios: both scopes, staff restrictions, create client, platform/client denial, owner transfer, workspace switch, revocation, consent UI and live downgrade |
| Prior Stage 12 / 11 | **passed** | Stage 12 11 DB + 7 Chrome; Stage 11 6 runtime-role + 9 four-client DB + 9 Chrome; earlier Stage 03–10 fixtures repeated successfully |
| Offline regressions | **passed / mocked as specified** | 372 top-level, 40 source/index, 115 Internal tests; Python 182 reported, 9 opt-in skips. No new live AI/provider test |
| Lint / build | **passed** | Full/focused frontend lint and full production build with remote variables excluded |
| Retained local review setup | **passed** | Existing migration/seed/launcher created new synthetic identities on separate loopback DB; real owner sign-in/API/page and closed gate verified on port 3001; credentials ignored and opened privately |
| Live provider/email/CDN/scheduler/rotation/production role mapping | **not run / pending as previously classified** | Local inbox/status/mapping features do not establish live consent, resource ownership, mail transport or external deployment safety |

Sources in the new fictional agencies intentionally have no inherited AOC packs
or private provider credentials. This stage verifies scoped status views and
existing source/AI regressions, not a new live source publication workflow. Stage
20B approval and existing next-check/15-minute revocation limits remain. Browser
BFCache/deployed cache limitations are unchanged. Mobile/other browsers unverified.

**Stage 13 local engineering complete; external rollout HOLD.** Hosted-AI privacy
and deployed private CDN/cache remain critical external-release checks. Deployed
runtime/pooler, providers, scheduler and rotation remain deployment verification.
No Neon, real payments/messages or personnel data. Stop before Stage 13A.


## Stage 13A specialist assignments — November 19, 2026

Base 4316efd; actual AI\portal project paths, feat/agency-platform. Separate
disposable PostgreSQL/synthetic accounts; existing reviews preserved.

| Boundary | Status | Actual evidence |
| --- | --- | --- |
| Engagement versus customer authorization | **passed** | 11 real PG/Better Auth/API/Python TAP checks including parent: engagement-only/manager denial, identity-optional engagement and explicit linking without client rights |
| Agency-approved resource/action scope | **passed** | Foreign agency/client/file and unsupported-action/personnel-field denial; explicit file/note actions; client/agency/platform/Internal roles kept independent |
| Replacement, expiry, revocation and work | **passed** | Atomic replacement and old URL denial, engagement end, inactive membership, live expiry/session checks; in-flight output denied; transaction rolls back expired write; idempotent notes |
| File grant lifetime | **passed** | Copied links require current authorized account/assignment; safe private download headers; no signed URL is minted. Authorized in-flight/downloaded bytes remain outside recall |
| HR/AI evidence boundary | **passed / model mocked** | Actual guarded Python/PostgreSQL loader projects business fields only; private synthetic HR canary absent. Deterministic fake answer uses approved evidence. General client AI denies specialist-only accounts; no live model/privacy pass |
| Browser permissions and controls | **passed** | 7 Chrome scenarios on actual production build: separate scopes/downloads, manager/Internal denial, notes/actions, engagement/assignment approval, expiry/session removal, replaced context, actual replacement/end controls |
| Prior regressions | **passed** | Stage 13 11 DB + 9 Chrome, Stage 12 11 DB + 7 Chrome, Stage 11 6 runtime-role + 9 four-client DB + 9 Chrome; earlier Stage 03–10 fixtures repeated |
| Offline/lint/build | **passed** | 372 top-level, 40 source/index, 115 Internal tests. Python 185 reported, 9 opt-in skips. Full/focused lint and full production build pass with remote env excluded |
| Retained review setup | **passed** | Fresh synthetic profile/migrations/seed, safe runtime diagnostic and real owner/specialist sign-in/delivery API/page verified on port 3002; prior review servers retained |
| Live AI/CDN/providers/deployment | **not run / external HOLD** | Existing critical hosted-AI/edge privacy checks and deployment role/pooler/provider/scheduler/rotation checks remain. No specialist ChatKit/queue/mail/payment/HR rollout claimed |

New tables have ENABLE/FORCE-RLS owner controls; raw ordinary runtime ledger reads
deny. The legacy shared service remains trusted application SQL, not universally
tenant-restricted RLS. No Neon or real personnel/customer/provider data was used.
The approved business-file/context selection is explicit; no automatic classifier
of every human-entered sentence/file is claimed. Old Google freshness/revocation
and BFCache/browser/deployed cache limitations remain. Local engineering complete;
external rollout HOLD; stop before Stage 14. No push.

## Stage 14 — local account-security evidence (2026-11-19)

Baseline 4bbc4e0; actual project AI\portal on feat/agency-platform. Ordinary
guarded Node/Next/Python runtime and separate operator on fresh synthetic loopback
WSL PG18.3; production Next build, Chrome157. Better Auth1.7.2, Node22/Python3.13.
All test configurations excluded .env.local/provider settings; Neon untouched.

| Boundary | Status | Actual evidence |
| --- | --- | --- |
| Migration/auth prerequisite | **passed** | Official provider migration creates factor schema; 011 applies twice with matching checksum and no duplicates |
| Invitations | **passed** | Intended identity/agency/client/role binding, foreign field/hash/account denial, expired/revoked inviter, atomic concurrent replay, old UUID/internal entry denial, same existing identity retained |
| Members & Access approval | **passed (database)** | Client Admin request deduplicates without grant; cannot approve/elevate or target foreign client; Agency Admin approval then recipient acceptance grants only the bound client and preserves other agency |
| Privileged sessions/MFA | **passed** | Password-only/stale/unverified sessions deny; provider enrollment rotates session, signed challenge withholds login, wrong OTP/trust bypass/factor replacement/privileged disable deny; recovery code consumed once |
| Recovery/verification | **passed; mail captured locally** | Actual provider reset expiry/replay rejection, session invalidation, MFA and membership preservation; generic known/unknown recovery responses, trusted-origin rejection and database rate limit |
| Database/runtime/Python | **passed** | 16 TAP checks including parent; FORCE-RLS ledger reads deny; pooled role remains clean; both connectors reject ownership of new factor table; Python envelope check denies unassured privilege; specialist expiry still denies |
| Browser | **passed** | 8 Chrome scenarios: MFA/direct API denial then authorized/foreign check; intended invite/replay/same-tab fragment; password reset/replay; other-session revocation; no token in URL/storage; UI email verification/TOTP enrollment/recovery code; account-switch concealment/old-code removal; explicit recipient/client approval and acceptance |
| Existing regressions | **passed** | Stage03 9 scenarios; Stage04 9; Stage05 5; Stage06/07 11; Stage08 1 real DB/mock model; Stage09 6; Stage10 9; Stage11 runtime6 and matrix9; Stage12 11; Stage13 11; Stage13A11. Earlier browser matrix9, agency9, specialist7 and platform7 passed in the initial full run |
| Offline / build / lint | **passed** | General372, Internal115, source/index40; Python185 reported with9 opt-in skips; official repository lint + changed-file/test lint; complete production build with unreachable synthetic build DSN |
| Live mail / hosted account controls | **not run / blocked for production** | No live transport selected or real mail sent. HTTPS cookie/proxy/CSRF deployment, real-email enrollment, all-factors-lost procedure and rotation/restore require approved setup |
| Existing external isolation | **not run / external HOLD** | Hosted AI/privacy and deployed private CDN/cache remain critical. Provider consent/revocation, deployed roles/pooler, scheduler and supported-browser/real BFCache checks stay pending |

Commands use the repository's test:account-security:database and :browser scripts
with matching private disposable fixtures, existing earlier-stage tests, Python
unittest discovery, official npm lint target, and Next build. The private isolated
orchestrator is .tmp/stage14/sql-focused.py in the original workspace; it runs
repository paths from AI\portal, then removes the acceptance database/server.
Initial full-run earlier-browser evidence was retained; focused retries did not
relabel those as newly repeated. Provider cryptography/PostgreSQL/browser checks
are real local executions; email transport is local capture, sources/AI are
fixtures/mocks. No local count means a live staging/provider security pass.

Exploratory `eslint .` also scanned an ignored pre-existing React bundle and an
unrelated existing openrouter test: 16 errors/1 warning outside the configured
repository lint target. No Stage 14 lint failure remains. Official npm lint target
and focused changed tests pass. The raw exploratory failure is not a new build
failure or an excuse to alter unrelated files.

**Verdict:** Stage 14 local engineering complete; privileged production and
external agency rollout remain HOLD. The local port-3003 review uses separate
generated accounts; no automatic promotion of real administrators. No Stage 15
work, real message/payment, remote database write or push.

## Stage 15 local branding evidence — 2026-11-19

Baseline d3999df; primary AI\portal, feat/agency-platform. WSL PostgreSQL18.3,
ordinary guarded runtime plus separate operator, synthetic accounts only. Node22,
Next16.3.3, Better Auth1.7.2, sharp0.35.4, Python3.13, Chrome157. .env.local/remote
provider values excluded by isolated build/test launcher; Neon untouched.

| Boundary | Result | Actual coverage |
| --- | --- | --- |
| Migration012 | **passed** | Repeated checksummed apply on disposable DB; no duplicate branding/domain records |
| Owner/agency/data boundary | **passed** | 8 real DB/API TAP checks including parent: public presentation-only fields, own/foreign/staff/client checks, owner-only save, bad palette/logo/foreign fields deny without writes, stale revision rejects |
| Reports/public logos | **passed** | Private scoped agency JSON/CSV, no foreign client fields; prepared PNG/no-store/nosniff; unknown/wrong-revision logo denies; raw ledgers FORCE-RLS deny; ordinary pooled state clean |
| Domain ownership/status | **passed with provider mocked** | Collision, caller denial, generation/revocation race rejects; exact fixed host/project provider adapter tests, pending/mismatch/redirect rejection. No live domain activated |
| Stage14 account boundary | **passed** | 16 real provider/DB checks +8 Chrome scenarios repeated before012; new branded flows additionally use same provider sessions/MFA, same-origin callbacks, no arbitrary redirects and immutable invitation-agency matching |
| Branded browser workflows | **passed** | 7 Chrome scenarios on final production build: two distinct logos/names/palettes,390px mobile/no overflow/computed button color; branded login/MFA/nav/logout; preview/valid raster upload/save/bad logo+contrast; multi-agency switch/exports; recovery identity; Host/forwarded-host/cookie/origin rejection; wrong-brand invite denial then valid acceptance |
| Visual review | **passed locally** | Fictional public Harbor mobile/Summit desktop screenshots inspected; corrected remaining AOC gradient/button override and added computed-theme assertion. No real client screenshot/credential captured |
| Other database regressions | **passed** | Stage03 9 scenarios; Stage04 9; Stage05 5; Stage06/07 11; Stage08 1 DB/model mock; Stage09 6; Stage10 9; Stage11 matrix9; Stage12 11; Stage13 11; Stage13A11; review runtime-role diagnostic |
| Offline/lint/build | **passed** | 378 general,115 Internal,40 sources/index; Python185 reported with9 opt-in skips; official repository and changed-file/test lint; full production build with unreachable synthetic build DSN; native upload trace includes62 sharp-related and21 @img files |
| Website Insights brand adapter | **passed with auth/report fixture** | Allowed context identity in CSV/JSON ignores supplied foreign agency; denied reads stay denied. Actual live client analytics/provider export not run |
| Review server | **passed** | New port3004 synthetic database/migrations/seed, separate profile, MFA/own API and foreign denial for each owner. Earlier review profiles preserved |
| Live domain/DNS/TLS/SSO/hosted cache | **not run / external HOLD** | Provider credentials/setup intentionally absent; no DNS/hosting mutation. Verified fixture status does not enable Host routing. Deployed custom-host cookie/CSRF/proxy/callback/CDN behavior remains critical before activation |

Commands: test:agency:branding:database / :browser against matching private
AGENCY_WORKSPACE_TEST_DATABASE_URL, DATABASE_URL, ACCOUNT_SECURITY_FIXTURE and
AGENCY_BRANDING_FIXTURE; repository general/Internal/source tests; Python unittest
discovery; npm lint target and focused lint; Next production build. Private
.tmp/stage15/sql.py runs actual AI\portal files, repeats earlier versioned
fixtures, then removes the acceptance DB/server. Its Vercel transport is mocked;
real provider/external staging verification is not inferred from local counts.

The earlier6-case runtime/older browser matrices remain their prior evidence;
they are not relabeled as repeated Stage15 runs. Stage06 deployed/browser and
CDN/private cache, hosted-AI privacy, provider consent/resource/revocation,
scheduler, pooler/runtime deployment and rotation checks remain carried forward.
Google revocation retains next-check /15-minute source freshness. Stage14 live
email/legacy real-email enrollment and all-factors-lost policy are still pending.

**Verdict:** Stage15 local engineering PASS; external agency/custom-host activation
HOLD. No platform promotion, AI-settings change, personnel/customer import,
message/payment, Neon write or push. Stop before Stage16.


## Stage16 - business onboarding without Hubstaff

**Local PASS; external rollout HOLD.** Fresh loopback disposable PostgreSQL18.3,
ordinary guarded runtime plus separate operator, synthetic AOC-owned no-project
clients and fictional foreign agencies. Migration013 twice; public records and
sequences match before/after. Stage16 DB/API8 TAP checks (including parent), actual
Python evidence authorization/revocation child, and Chrome5 all pass. Same-agency
foreign client, foreign agency, effective read-only downgrade, Viewer/Member
writes, mismatched FK and mass assignment deny without partial writes. Completed
website reports/exports are client-bound; workspace switching partitions form and
report state. No Hubstaff polling occurs for unmapped dashboards. Stage14 Chrome8,
Stage15 Chrome7 and prior DB matrices repeat; see PROGRESS for exact counts.

Fixture Work proxy forwarding/General behavior and existing source approval tests
are deterministic. Saved website findings are synthetic, not live crawl/analytics;
no live LLM answer or hosted stream privacy claim. Credentials, database profiles,
reports, mail, logs and scratch supervisors are ignored. Commands/runbook:
STAGE16_WITHOUT_HUBSTAFF.md and tests/agency-backfill/business.database.test.mjs,
tests/client-business/playwright.config.mjs; actual primary app files are exercised.
379 general,115 Internal,40 source/index; Python188 reported/10 optional skips;
repository/focused lint and production build pass. New Python opt-in DB test is
executed by the local DB suite. No Neon, real messages, documents or provider use.

Hosted-AI/privacy and deployed private CDN/cache remain critical external release
boundaries. Stage06 deployed/browser coverage, real BFCache, provider consent/
resource/revocation, schedulers, runtime/pooler deployment, rotation/restore, live
mail/recovery and custom-host checks retain earlier status. Google's detection
window remains next-check/15-minute freshness. Non-AOC client entry stays gated;
new business evidence is not permission to inherit AOC knowledge. No Stage16A.


## Stage16A — approved delivery guidance and onboarding (2026-11-23)

**Local PASS; external activation HOLD.** Stage16 checkpoint9bb7d49 on
feat/agency-platform. Existing permissions and runtime-role guards are reused.
No agency/client/person selector or profile text grants customer/AI authority.

| Boundary | Status / actual evidence |
| --- | --- |
| Agency/profile ownership and approval |passed — real SQL/API; draft cannot be assigned, approval pins an immutable revision; cross-agency/client/person attempts deny without partial writes; profile edit preserves membership and assigned guidance. |
| Staff/specialist scope |passed — own staff require existing customer access; specialist needs approved matching unexpired assignment; engagement/client/Internal identity alone fails. Read-only UI and API agree. |
| Current access |passed — revoke, suspension, expiry, role downgrade, specialist replacement and profile retirement deny subsequent reads/updates. Open-page focus recheck clears denied content. Visibility recheck bound is15 seconds; no instant remote-erase claim. |
| Database/runtime/pooling |passed — four ENABLE/FORCE-RLS tables, direct runtime SELECT denied, composite mismatch rejected, ordinary session identity retained. Four narrow caller functions; no per-tenant session GUC. Legacy service-role exception remains explicit. |
| Progress/replay/history |passed — persisted blocker resumes after reload, repeated operation creates no duplicate, stale revision conflicts. Repeat014 left full logical snapshot identical. Four-step completion is self-report, not a deliverable approval or task write. |
| HR and AI boundary |passed with synthetic canary — private fixture HR text absent from permitted views; no HR table join or new AI ingestion/provider call. Live model behavior remains not run; no semantic DLP guarantee for voluntary text. |
| Browser/UI |passed —8 Chrome scenarios using real session cookies, actual server/database and blocked external network, including390px viewport. Separate password/TOTP health check plus repeated Stage14 interactive auth browser8. |
| Regression/build |passed —10 Stage16A DB/API TAP checks incl parent; prior DB matrices; branding Chrome7, business Chrome5;381 general,115 Internal,40 sources/index; Python188 reported/10 skips; repository/focused lint, production build. Prior auth-mail dynamic tracing warnings remain. |
| Hosted/providers/CDN/real mail/DNS |not run — critical hosted-AI privacy/private-cache gates remain HOLD. Provider consent/revocation, deployed runtime/pooler roles, scheduler, rotation/restore and real mail/custom-host checks retain prior status. |

Commands: package agency:onboarding; test:delivery-onboarding:database / :browser
with matching private DELIVERY_ONBOARDING_FIXTURE, DATABASE_URL,
AGENCY_WORKSPACE_TEST_DATABASE_URL and current local Better Auth/capture settings.
Operator migration uses AGENCY_MIGRATION_DATABASE_URL and exact target/role flags.
No real data, Neon/Supabase connection, message, payment, provider request or push.
Stage17 is not implemented. See PROGRESS and STAGE16A_DELIVERY_ONBOARDING.md.
