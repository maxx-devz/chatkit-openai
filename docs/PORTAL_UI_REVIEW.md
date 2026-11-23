# Admin and Client Portal interface review

Completed locally on 2026-11-20 in `C:\Users\MY PC\Desktop\AI\portal`, branch
`client-documents`. Existing pricing copy, Supabase setup files, local environment
and unrelated edits were preserved. In particular, the user's newer label
**How many credits per $1 (USD)?** was retained.

## Scope and result

Reviewed the active Admin and Client Portal entry points and their shared modules.
Applied consistent, lightweight blue/white card surfaces, spacing, readable
reporting labels, form alignment, focus states and touch targets. This is a local
UI/performance change, not a deployment or a new feature rollout.

No authentication, membership, tenant/project ownership, pricing arithmetic,
database connection or schema changes were made for this task. The Internal
Portal keeps its original behavior and appearance: the new rules in the Admin
stylesheet are explicitly scoped to `[data-portal-ui="admin"]`, because Internal
Settings imports that stylesheet too. No Internal Portal source was edited.

## Page inventory and review coverage

| Area / page | Review and changes | Verification |
| --- | --- | --- |
| Login `/login` | Existing sign-in flow retained | Actual private local login used for the Admin review; no credentials printed |
| Admin overview `/admin` | Balanced metric cards, readable labels, clear workspace links, scoped theme | Desktop/mobile actual-page review and fixture tests |
| Clients `/admin?view=clients` | Directory scrolling on short screens, wrapping client names, aligned forms and buttons, workspace ID described as a workspace rather than a username | Actual empty-state review; populated synthetic sections, draft preservation and mutation regressions |
| Client tabs: overview/access/usage/integrations/activity | Consistent card treatment and controls; permissions and saved data untouched | Existing populated fixture suite |
| AI Usage `/admin?view=usage` | Usage cards and headings aligned; unnecessary presence polling removed from this view | Actual-page review; usage/reset fixture regressions |
| Admin AI `/admin?view=assistant` | On-demand module loading and themed card; no Hubstaff/client data access changes | Actual-page review; no live message submitted |
| Access & Security `/admin?view=security` | Provider module loaded when needed, consistent form/card treatment | Actual-page review; no provider configuration changed |
| AI Pricing & Credits `/admin/credits` | Earlier detailed currency/credit labels preserved; consistent spacing, aligned preview results and form controls | Actual-page review; exact pricing and draft/preview fixture tests |
| Assistant Settings `/admin/settings` | Existing builder given matching card styling and wrapping controls | Actual-page review of the fresh database's available state; no publication |
| Sources `/admin/sources` | Matching source/preparation cards; existing revocation/status wording preserved | Actual-page review; mocked OAuth/status denial regressions |
| Documents & Journey `/admin/client-documents` | Themed cards and aligned client selectors/forms | Actual fresh/empty-state review; no publication or Google request |
| Admin Audit `/admin/audit` | Readable, scroll-contained tables and matching sections | Actual-page review; audit metadata only |
| Legacy `/builder`, `/admin/hubstaff-index` | Existing builder alias and redirect inspected; no additional administration window introduced | Source review; destination screens reviewed above |
| Client dashboard `/` | Consistent spacing between document summary, metrics and workflow cards; larger captions and task labels | Populated fictional Hubstaff/document fixture, desktop/mobile |
| Website Insights `/?view=website-insights` | Matching report cards, loading behavior and correct embedded heading level | Empty-state desktop/mobile fixture; both existing frontend lint errors resolved |
| Client AI `/?view=ai` | No unnecessary Hubstaff provider/polling on the AI-only page | Browser asserts zero Hubstaff requests; assistant access/reconnect scenarios use a fake CDN runtime |
| Monthly Time `/?view=time` | Readable hours/budget captions and consistent card surfaces | Fictional Hubstaff results; unavailable/zero distinctions retained |
| Project Status `/?view=projects` | Larger stage/task labels, consistent cards; real source status names retained | Fictional workflow data; no task change or approval |
| Documents `/?view=documents` | Matching official documents/journey and reference cards, aligned filters | Desktop/mobile empty states and permission-driven controls; no live Drive download |
| Members & Access `/?view=members` | Readable, aligned controls and matching access cards | Fictional client roles; Viewer navigation restrictions retained |
| Client Audit `/?view=audit` | Matching tables and sections | Fictional activity data; no private prompts or credentials displayed |
| Account `/?view=account` | Matching password card; clear account actions and failure messages | Browser workspace-switch failure/retry and failed sign-out scenarios |
| Credits `/credits` | Consistent reporting cards and numeric alignment | Unknown costs/zero balances, credit header, navigation, refresh and allowance fixture regressions |

The actual Admin review visited 10 pages at 1440×1000 and 390×844, producing 20
successful checks without page errors or horizontal document overflow. It used
the approved fresh Supabase development database and an existing private local
admin account. Browser mutations and external-provider requests were blocked.
Normal authentication sessions and audit-read bookkeeping can be recorded; no
client, pricing, credit, source, document or provider settings were changed.

## Navigation and performance

- `components/portal/client-page-modules.js` loads optional Client Portal modules
  on demand. Admin Assistant, provider settings, usage, client websites and
  Hubstaff indexing panels also use separate dynamic imports.
- Next.js/browser code chunks can be reused after their first load. There is no
  new persistent cache of client, financial, membership or conversation data.
- `components/portal-ui/navigation-link.js` uses the installed Next.js
  `useLinkStatus` API for a fixed-size pending indicator. Existing `prefetch=false`
  choices remain, avoiding speculative requests against private/provider paths.
- The original full-page Admin/Credits/root loading cards were removed after
  visual review. The current authorized screen stays visible during navigation;
  links show a small pending spinner and thin progress bar. Dynamically loaded
  modules use a compact inline message. No auth or private-data cache was added.
- A browser check confirms sidebar navigation stays within the document rather
  than performing a full reload. A separate check confirms an AI-only visit makes
  zero Hubstaff requests. Admin presence polling runs only where presence appears.
- CSS gradients add no image/font downloads. Header backdrop blur was removed;
  reduced-motion preferences are respected. Sidebars can scroll independently.
- Existing private API `no-store` behavior and server authorization remain intact.
  Workspace controls remount on verified client/user changes; failed switching
  and sign-out now show retryable errors instead of leaving controls disabled.
- The two Website Insights effect/lint issues were fixed by starting cancellable
  work asynchronously and guarding aborted requests. No new cross-site cache was
  introduced.

No end-user speed percentage, Lighthouse score or hosted p95 latency is claimed.
Development compilation, database round trips, provider response time and hosted
CDN behavior still affect observed speed. Hosted performance testing remains a
separate check; build compilation time is not page-load time.

## Actual validation

| Check | Result |
| --- | --- |
| `node --test "tests/*.test.mjs"`, database disabled | 367 passed; zero failed/skipped |
| Existing Internal Portal mock/alias Node suite, database disabled | 115 passed; zero failed/skipped |
| Complete Client readiness/assistant browser suite | 34 passed across desktop/mobile |
| Final Client layout rerun after typography changes | 2 passed; covers eight modules per viewport and header overlap |
| Complete Admin readiness/source browser suite | 20 passed across desktop/mobile |
| Actual local Admin read-only visual review | 20 page/viewport checks passed |
| Full project ESLint scope | Passed; no errors |
| Production build | Passed using disabled local database/provider fixtures and no live credentials |
| `git diff --check` | Passed |

Initial new browser failures came from ambiguous heading/alert selectors. Those
were made specific to the existing page structure. The pricing check also needed
to follow the user's updated currency label. Final checks passed; the application
was not changed to restore obsolete labels.

Client screenshots and browser output are ignored under
`.tmp/portal-polish-layout-final/`, `.tmp/portal-polish-client-final/` and
`.tmp/portal-polish-admin-final/`. Actual Admin screenshots/results are kept in
the restricted private `.tmp/supabase-fresh-local/portal-polish-review/` folder.
They are not committed or public assets.

## Review and remaining checks

Local review servers were restarted at `http://127.0.0.1:3000`; Python health is
available at `http://127.0.0.1:8000/health`. Existing private accounts remain in
their original private location. Drive/Hubstaff sync workers are disabled for
this review launch; saved environment settings were not changed.

Live AI replies, Google consent/downloads, paid provider actions, live Hubstaff
operations, email, payments, hosted CDN caching and production load testing were
not exercised. Missing Google/provider setup from the Supabase handoff remains
pending. No Neon access, migration, Vercel environment change, commit or push was
performed for this UI task.


## Follow-up: fee, usage and allowance clarity (2026-11-20)

The reported 200,000 was the configured $200 fixed monthly AOC fee multiplied
by 1,000 credits per USD. The existing `creditsUsed` total included that fee,
even when there were no recorded AI chats and no allowance had been allocated.
It was a reporting entry, not evidence of 200,000 credits of AI activity or a
payment. No saved price, ledger entry, client balance or usage history was deleted.

### Changes

- `lib/credits-repository.js` returns separate `aiUsageCredits`,
  `fixedFeeCredits` and `fixedFeeUsd` using client/month-scoped aggregates.
  The existing combined `creditsUsed` field, exact-decimal calculations,
  pricing versions and idempotent fee/usage accounting remain compatible.
  An unassigned allowance no longer produces an overage claim.
- `components/credits/credit-breakdown.js` is reused by the admin client
  summary, pricing/allowance page and client Credits page. It separates AI
  consumption from the monthly service fee and explains total deductions.
  Fixed-fee cards form a balanced two-column layout, stacked on mobile.
- An unset allowance now takes precedence over the generic uncertain-balance
  message. Missing provider costs and partial tracking history remain explicit;
  they are never silently treated as complete or free usage.
- Pricing setup explains two independent steps: save pricing, then assign
  each client's allowance. The first assignment hides subtraction, requires a
  reason and preview, and uses an explicit Assign allowance confirmation.
  Existing allowance adjustments retain add/subtract, retry keys and audits.
- The client summary links directly to `#allowance-adjustments` for the chosen
  client. No automatic allocation, renewal, payment or access restriction was added.
- Removed the full-screen loading fallbacks introduced in the earlier UI pass.
  Slow-route checks verify the current admin screen remains visible, with a small
  progress indicator, while the destination resolves its existing authorization.
  Private APIs remain uncached; Internal Portal controls were not changed.

### Actual verification

| Check | Final result |
| --- | --- |
| Complete top-level offline Node suite (`DATABASE_URL` empty) | 368 passed; zero failed/skipped |
| Independent Internal Portal mock/alias suite | 115 passed; zero failed/skipped |
| Complete Admin desktop/mobile fixture browser suite | 24 passed, including first allowance, fixed fee and delayed navigation |
| Complete Client desktop/mobile fixture browser suite | 36 passed, including the fee-only/no-allowance case |
| Final client fee/layout rerun after card alignment | 4 passed |
| `scripts/check-credits-database.mjs` on fresh disposable WSL PostgreSQL 18 | Passed; includes fee-only zero AI usage, no invented allowance/overage, breakdown totals, read-only admin reporting, retries, immutable history and client isolation |
| `scripts/check-admin-readiness-database.mjs` on the same disposable server | Passed with explicit UTC fixture session |
| Actual local admin page check on desktop/mobile | Passed; real credit breakdown, unset allowance, setup anchor and delayed RSC navigation with retained screen |
| Full project lint | Passed |
| Production build of actual project paths | Passed with disabled loopback database/provider configuration |
| `git diff --check` | Passed |

The admin database fixture initially failed because its bare-date input assumes
UTC while the disposable server inherited a different system timezone. Rerunning
with `PGOPTIONS=-c timezone=UTC` passed; application behavior was not changed.
The new slow-navigation check initially found the allowance link still used a
plain Link. It now uses the shared pending indicator, and final checks passed.

Provider responses and mutations in the fixture browser suites are mocked.
The actual local page review uses the approved fresh local Supabase configuration
only for existing-account sign-in and authorized reads; browser financial and
settings mutations are blocked. It confirms zero recorded AI credits and the
separate fee without allocating anything to gogrit. Database writes for these
regressions occurred only in TEMP fixtures on disposable local PostgreSQL,
which was stopped and removed afterward. No Neon connection or migration ran.

Artifacts are ignored under `.tmp/credit-clarity-admin-final/`,
`.tmp/credit-clarity-client/`, `.tmp/credit-clarity-client-layout-final/` and the
restricted `.tmp/supabase-fresh-local/credit-clarity-review/`. No credentials are
included in tracked files. Existing unrelated local edits are preserved.

Local review: `http://127.0.0.1:3000/admin?view=clients` or
`http://127.0.0.1:3000/admin/credits`. The review web and Python servers were
restarted with provider background workers disabled, without editing `.env.local`.
Live AI/Google/Hubstaff actions, hosted performance and CDN behavior remain
unverified. There is no measured speedup claim. No commit or push was requested
or performed for this follow-up.


## Follow-up: per-client portal plans (2026-11-20)

This supersedes the earlier reporting-only main pricing UI for clients explicitly
enrolled in a plan. `/admin/credits` now renders **Client Plans & Credits**:
monthly portal price, independently chosen included AI credits, paid activation,
plan pause, audited extra-credit approval, client requests and usage reconciliation.
The Clients overview/AI Usage & Credits tab links to the selected client's plan.
The old global editor component/API remains as historical compatibility code;
its fee entries are never used as subscription debits. It is not the main page.

Client `/credits` displays the paid plan and can record a request for more credits
or an upgrade for permitted users. Requests do not send real messages or collect
payment. Admin verifies payment outside the portal and records a reference before
activation/top-up. Current paid-month entitlement is immutable; later settings
apply when a new month is activated. Monthly renewal needs payment confirmation;
there is no automatic card charge or rollover. Saving a plan without activating
the current paid month deliberately pauses new replies until payment is confirmed.

The signed Python backend checks membership, paid month, status, remaining credits
and a client-wide in-flight reservation independently of the UI. History is not
subject to generation credit checks. The reservation/request UUID binds settlement
to existing scoped cost observations. Missing usage, interrupted workers and
unpriced tools fail closed for review. No stale reservation is assumed free.
Admin reconciliation requires a verified cost and audited reason; foreign run
IDs and duplicate settlement are denied. Reporting resets do not refund plan usage.
Quota admission is checked **before each reply**: one in-progress reply can exceed
the remaining balance, after which further replies are blocked. This is not a
guaranteed provider-dollar cap. The UI and setup guide explain this limitation.

### Files

- `database/client-plans.sql`, `database/client-plans-private-grants.sql` and
  `scripts/migrate-client-plans.mjs`: version/checksum migrations, repeatability,
  runtime grants, explicit remote target confirmation and dry-run support.
- `lib/client-plan-{policy,store}.js`, new admin/client plan routes and the
  existing credit/access routes: trusted scope, exact database arithmetic,
  idempotent paid adjustments and one scoped snapshot query for plan loading.
- `chatkit_backend/client_plans.py`, `app.py`, `assistant.py`: actual generation
  admission, client serialization, cost-request binding and fail-closed settlement.
- New `admin-plans`, `admin-client-plan`, `client-plan-view` components and small
  existing navigation/credits integration changes. Plan form values remain separate.
- Policy/API, actual PostgreSQL/Python HTTP and desktop/mobile browser regressions.
- `docs/CLIENT_PLANS.md`, portability notes, package commands and one blank
  optional operator URL placeholder in `.env.example`. No secret values added.

### Actual final results

| Check | Result |
| --- | --- |
| Complete offline top-level Node suite | 372 passed, zero failed/skipped |
| Independent Internal Portal regression suite | 115 passed, zero failed/skipped |
| Admin desktop/mobile browser suite | 30 passed; includes new plan/top-up/request cases and retained legacy regressions |
| Client desktop/mobile browser suite | 36 passed |
| Final plan form desktop/mobile rerun | 4 passed |
| Disposable PostgreSQL migration rehearsal | Preview made no persistent writes; migration applied twice without duplicates |
| Actual runtime-role Node plan database checks | Passed: paid activation/top-ups, cross-client/role denial, no partial writes, retries, immutable paid month, paused access, scoped requests, reconciliation and audit grants |
| Actual Python/PostgreSQL plan gate and signed HTTP | 8 passed: exhausted/revoked HTTP requests never call provider/SDK; concurrency, renewal, interruption, unknown costs and legacy independence |
| Existing signed-request/history security tests | 7 passed |
| Existing mocked provider/ChatKit stream suite | 11 passed; preexisting AsyncMock cost-transaction warnings remain fixture limitations |
| Actual local admin review | Desktop/mobile passed for plan setup and scoped client summary; financial/settings mutations blocked |
| Approved fresh Supabase schema/grants activation | Versions 1–2 applied; all 66 old table counts unchanged; zero client plans created; actual public browser-role access denied |
| Full lint and production build | Passed; build used disabled loopback database/provider settings |

The first browser regression runs still expected the old reporting summary and
labels; these were updated to the new UI while keeping legacy pricing component
checks separate. The existing mocked provider-secret test needed an explicit
legacy/no-plan gate mock after admission moved before provider setup. Actual gate
and HTTP denials use the disposable database rather than that mock. A Windows
selector-loop test setup was required for psycopg. All final affected checks passed.

Provider responses/payment events in browser fixtures are mocked. Actual paid AI
usage and payment-provider verification were not exercised. Before live rollout,
deploy the matching Next.js/Python code and verify the selected provider/model's
cost records. Existing pending Google, email, CDN and hosted checks remain pending.
No API key, private account file, environment file, temporary credential or real
client document was copied into Git. No branch switch, commit or push occurred.

Local review remains `http://127.0.0.1:3000/admin/credits` with the existing private
admin login. Review servers were restarted with background provider workers off.
No client was silently enrolled: choose its price/credits and explicitly confirm
the paid month through Admin. Neon and deployment configuration remain unchanged.


## Follow-up: action colors and risk cues (2026-11-20)

Admin and Client Portal action cards now use a consistent purpose palette. The
entire relevant card has a tinted background and stronger leading border; an
inline SVG icon and short purpose label provide a clue beyond color alone.

| Purpose | Palette | Examples |
| --- | --- | --- |
| Reset/remove/withdraw | Rose background, dark red border/button | Reporting reset, reference removal, member deactivation, document withdrawal and connection removal |
| Caution/permissions | Amber background and dark amber accent | Plan pause, password changes, shared provider/Drive settings, verified cost reconciliation and publishing review |
| Edit/update | Blue background and blue accent | Client identity, plan edits, project mapping and verified journey progress |
| Add/create | Teal background and dark green accent | New client/login/reference/site, initial plan setup, paid credit additions and client requests |
| Read-only information | Light blue background and cyan accent | Cost reports, source inventory, plan summaries and approved document releases |

`components/portal-ui/action-cue.js` supplies lightweight inline icons. Explicit
`data-action-card`, `data-action-cue` and `data-action` markers opt into shared
rules in `portal-theme.module.css`. No text-matching heuristics, new dependencies,
downloaded icons, persistent cache or automatic action triggers were added.
Rules apply only inside the existing Admin/Client `.surface` roots; Internal
Portal imports of older Admin styles are unaffected. No Internal files changed.
Focus outlines, native disabled controls and forced-color fallbacks remain.

Reset preview uses a red-outline button; the actual confirmation is solid red.
Existing typed confirmation, scoped preview, expiry and idempotent retry behavior
are unchanged. Choosing Paused changes the plan card from add/edit to amber before
saving. Cancel/keep-reference controls remain neutral. Added form cues span existing
grid columns so field alignment is preserved on small screens.

The reset explanation now accurately distinguishes reporting history from paid
plan balances: reporting resets do not replenish subscription credits or refund
provider charges. Remaining activity labels point to the client plan's credit
limits rather than implying unrestricted AI usage. No reset/billing API changed.

### Actual results

- Full Admin desktop/mobile browser suite: **34 passed**. Checks include computed
  red reset backgrounds/borders, distinct preview/confirm buttons, semantic labels,
  add-to-pause color changes, unchanged confirmation/retry flows and layouts.
- Full Client desktop/mobile browser suite: **38 passed**, including rendered
  add-login, deactivation and account-security cues alongside prior regressions.
- Offline Node suites: **372 top-level + 115 Internal Portal checks passed**.
- Full project lint, production build and `git diff --check`: **passed**. Build
  used disabled loopback database/provider configuration.
- Enabled-button text contrast for the five palettes measured **5.48:1–7.56:1**.
  This is a palette measurement, not a claim of a complete accessibility audit.
- Actual local Admin desktop/mobile visual check passed for the reset and plan
  pages; reset/settings/payment writes were blocked. Screenshots remain private
  under `.tmp/supabase-fresh-local/action-color-review/`.

The new plan-pause test initially used an exact label locator that included option
text; selecting by the combobox's accessible name fixed the fixture check. One
first-load fixture timeout occurred during concurrent compilation; its assertion
now allows the initial compile to complete. Final full suites passed.

No database schema/configuration, client balance, paid plan, external integration
or live record changed for this visual task. No real reset or provider action was
performed. Existing live-provider/deployment checks remain pending. Review server
is running at `http://127.0.0.1:3000/admin?view=usage` with provider workers disabled.
All preexisting local edits remain; no commit or push was requested or performed.


## Admin activity and Overview follow-up — 2026-11-20

Added the detailed AOC admin activity timeline and redesigned Overview workspace cards. The six responsive cards have distinct icons, readable accent colors, descriptions, keyboard focus and explicit destinations. They reuse the existing layout and navigation; existing client and AI counters remain evidence-backed.

The activity timeline supplements existing historical admin/integration/AI records with authenticated request attempts and outcomes, safe error codes/code locations, references, filters and clear browser-vs-server labels. Failed and cancelled OAuth redirects are not shown as successful connections. No passwords, tokens, typed private values or chat content are recorded. Internal Portal surfaces remain independent.

See [ADMIN_AUDIT.md](ADMIN_AUDIT.md) for the 24-route/39-method inventory, failure semantics, privacy limits and repeatable migration. Full lint, production build, 383 offline tests and 119 Internal/auth regressions passed. Disposable WSL PostgreSQL migration/access/replay/privacy checks passed. Actual local desktop/mobile review and anonymous API denial passed with business writes blocked. The approved Supabase additive audit schema preserved all 74 existing table counts and `.env.local`; Neon was untouched. No external provider or deployment verification is claimed.

Review: `/admin` and `/admin/audit`. Existing edits are preserved; no push or commit was performed.

Final browser result: **44 Admin + 38 Client = 82 passed**, including the delayed-batch navigation check. Final production build and audit-error private cache-header tests passed. Local review server restarted on `http://127.0.0.1:3000`; provider workers remain disabled.


## Usage toolbar and recording availability ? 2026-11-20

Moved Client plans & credits into a clearly styled icon link in the spending header. Month, refresh and export controls have a separate aligned toolbar with matching heights and a mobile layout. A transient audit failure can no longer hide valid read-only usage/spending reports, and incomplete recording is explicitly disclosed. Browser audit batches use one atomic query with bounded retry backoff; mutation/reset/OAuth audit guards remain in place.

Actual local usage/spending/audit requests returned 200 without the screenshot's warnings. The original transient failure was not reproduced; runtime schema/grants were verified healthy. Synthetic verification covered audit outages, safe reads, guarded changes, batch atomicity/replay and layout. Passed: 386 + 119 offline regressions, 48 admin browser checks, disposable WSL database checks, full lint and isolated production build. The alignment check was corrected to measure positions together after async report rendering. No business-setting writes, shared schema/environment changes or provider calls were required. Neon untouched; local server restarted for review.


## Historical admin records clarity ? 2026-11-20

Updated the existing historical table itself, rather than relying only on the separate activity timeline: readable actions, meaningful affected-account labels, HTTP status/result and a final Log details column with explanation and expandable safe request diagnostics. Exact server-recorded event IDs link new history rows to their real response; older entries without stored evidence show Not recorded. No time-based correlation or fabricated historical success codes.

Passed: 511 offline regressions, 50 admin desktop/mobile browser checks, disposable PostgreSQL tests against actual client-create/update SQL, lint and production build. Actual local audit-read/HTTP 200 correlation and responsive table review passed with business writes blocked. No schema or private setup changes, no provider calls and no Neon access. Review `/admin/audit#admin-actions`.


## Compact audit activity table ? 2026-11-20

Activity cards are now a clean table with short messages and clickable expandable rows. Click/tap a row or its arrow to open/close the existing diagnostics; keyboard Enter/Space works on the arrow button. Filters, status summaries, pagination, privacy and historical records remain available. Passed: 52 admin desktop/mobile browser checks, changed-file lint and isolated production build. No database or private environment changes. Review `/admin/audit`.


## Plan save/update feedback ? 2026-11-20

Monthly-plan saves/updates and paid-credit additions now show explicit green confirmation after the API acknowledges success. Confirmation state is owned by the client workspace, so it survives keyed form remounts after refreshing data. It clears when editing the corresponding form or switching clients. Messages distinguish a saved plan awaiting payment confirmation, activation, paused access and future settings that preserve an existing paid month. Duplicate responses are identified without claiming another update or addition.

Saving/recording buttons and aria-busy expose pending work. Success and error feedback sits near the action button, uses accessible live regions and scrolls into view when outside the viewport (respecting reduced motion). Failed saves keep input and the retry key, with no false success. A successful save followed by a failed refresh keeps its confirmation, explains the read failure and allows Refresh plan to recover without another save/payment.

Verified with 14 focused desktop/mobile browser cases using mocked APIs: creation, update, paid activation/top-up, pending payment, preserved paid allowance, client switching, failed-save retry and refresh-failure recovery. Confirmations and errors were checked in the viewport. Changed-module lint and isolated production build passed. No real plan values, balances, payments, database schema, credentials or environment files were changed. No live provider or financial requests were used. The local review server was restored; no commit or push.


## Submitted-action audit policy ? 2026-11-20

Stopped browser navigation/click/checkbox logging and ordinary GET/read auditing. Existing noise is filtered from reports while its stored history is preserved. Submitted POST/PUT/PATCH/DELETE actions retain actor, target, HTTP result and safe diagnostics, including failures. Known previews/catalog reads are excluded. OAuth grant callbacks remain an explicit state-changing GET exception; authentication POST events remain private security records.

Expanded rows distinguish approved submitted values from values confirmed by a committed database operation/server result. Safe client/plan fields are readable with units; passwords, tokens, payment references and private/free-text content are excluded. Commit failures, duplicates and partial post-commit request failures are labelled accurately. Existing authorization and table expand/collapse behavior are preserved.

Passed: 515 offline regressions, 58 admin browser checks, disposable PostgreSQL checks, full lint and isolated build. Actual local navigation/filtering produced zero browser POST telemetry and no additional read/browser audit records. No shared schema/private environment or real client plan/balance changes. No live provider/financial mutations tested; Neon untouched. Review `/admin/audit`.

## Documents focus reload fix - 2026-11-23

Cause reproduced in the real ClientDocumentAssignments component using an isolated
Chrome fixture: dispatching five browser-focus events caused five extra reference
GETs (six total). The focus listener set loading=true and replaced the entire
SelectedClient subtree, removing its reference/delivery/journey forms. Native
select popups and switching tabs can trigger that focus event.

Removed that focus subscription. Reference data now refreshes on client selection,
completed save/removal, or an explicit Refresh references button. Subsequent reads
keep forms mounted, retain unsaved edits on transient failure, and display a stale
reference warning with retry. Request sequencing rejects late pre-save responses.
401/403/404 responses still remove previously displayed client content. Server
permissions, no-store requests, publication approval and client scope are unchanged.

Application: components/admin/client-document-assignments.js.
Verification fixture: tests/client-readiness/ui/app/admin/client-documents/page.js.
Browser cases: tests/admin-readiness/browser/documents.spec.mjs.

Actual results:
- Reproduction before fix: one desktop case failed with six GETs instead of one.
- Final Chrome desktop/touch: 14 passed (focus/native-select event simulation,
  unsaved reference and journey drafts, delayed refresh, transient failure/retry,
  saving without form replacement or duplicate write, client switching, stale
  response ordering and authorization denial).
- Existing document assignment/delivery policy tests: 11 passed.
- Changed-file lint, full project lint, and git diff --check: passed.
- Isolated production build: passed, including /admin/client-documents. The first
  isolated build attempt rejected its node_modules junction outside Turbopack's
  root; only the temporary snapshot root was adjusted to include dependencies.
  The application next.config.mjs and running server build output were untouched.

Commands: node node_modules/@playwright/test/cli.js test --config
 tests/admin-readiness/playwright.config.mjs documents.spec.mjs;
 node --test tests/client-document-assignment-policy.test.mjs
 tests/document-delivery-policy.test.mjs; npm run lint; next build in the isolated
 .tmp/document-refresh-build-20261123 snapshot with database/provider access off.

Browser API responses were fixtures; no live Google document delivery or real
client save was tested. No database query/migration, production deployment,
environment change, commit or push was performed for this fix. Existing live
provider/deployment checks remain pending. Review /admin/client-documents.

## Approved Drive link library - 2026-11-23

Implemented the user-approved simpler default: admin saves an original individual
Drive link, explicitly confirms publication for the selected client, and that
client opens it in Google Drive. Saved references now show Private draft or
Published to [client], with Publish link and Unpublish link actions. Publication
requires a document type, journey stage, business reason and whole-file/sharing
confirmation. Folder references stay private. Save/edit/removal does not publish
or advance journey progress. Editing or withdrawing a published link requires
another explicit publication before it becomes visible again.

No Google OAuth/environment configuration or new migration is needed for links.
Existing optional version-approved protected downloads remain available. Their
Google configuration and empty release panel are hidden from the default setup
when that optional connection is not configured. The previous focus-reload fix
is preserved.

Publication uses an existing append-only assignment-audit JSONB receipt, committed
atomically with a new assignment revision. Queries require matching assignment,
client and revision, active publisher and no Internal Portal identity. Active
membership and workspace selection are checked on list and again on open. Portal
open URLs bind the publication revision, remain private/no-store, and redirect only
to a normalized HTTPS Google file URL with no portal referrer. Copied portal links
cannot grant another client access. Legacy protected downloads and link metadata
share server-side filtering/pagination; neither leaks admin reasons or credentials.

Limits: Google controls actual file access/downloads and later file changes. The
portal does not verify source content/sharing/version through Google's API in link
mode. Unpublishing cannot recall a direct Google URL, downloaded copy or existing
Google permission. An anyone-with-link file remains accessible outside the portal.
No automatic publication, Drive sharing change, email, payment or AI upload occurs.

Actual checks:
- 22 desktop/mobile Chrome component checks passed, with mocked APIs: default flow
  without Google settings, confirmation, draft/folder hiding, correct-client view,
  unpublication/edit withdrawal, retries and all focus/draft/client-switch cases.
- 30 actual disposable PostgreSQL 18 checks passed through ordinary runtime roles:
  7 original assignment checks, 7 simple-link checks, 11 existing protected-delivery
  checks and 5 Google-adapter checks. Auth, SQL, transactions, replay, same-client
  and foreign-client denial, copied links, stale revisions, revoked membership,
  Viewer access, publisher revocation, pagination and history were exercised.
  Simple-link checks used absent Google settings. Google transport in legacy
  delivery/adapter checks was mocked; no live Google access is claimed.
- Existing document migrations applied twice on the disposable database only.
- Full lint and all 398 top-level offline regressions passed.
- Production build passed from an isolated source snapshot without private env
  files or database/provider access. The dependency root adjustment was confined
  to that ignored build snapshot, preserving the running review server output.

The current WSL distro initially lacked PostgreSQL, so PostgreSQL 18 was installed
for fresh disposable tests. The first bootstrap needed its integration-audit
prerequisite. A new test's temporary memberships initially conflicted with an older
suite's fixture; cleanup was corrected and all four suites passed on a fresh database.
These were local test setup issues; no shared database repair was needed.

No Supabase/Neon data, real client link publication, Google permissions, private
configuration, live provider, deployment, commit or push was changed. The user can
review their existing saved reference at /admin/client-documents and explicitly
publish it, then sign in as that client at /?view=documents. Live Google sharing and
download availability remain the account owner's check.

Cleanup confirmed: both synthetic test databases and the dedicated WSL aoc_links
cluster were removed after verifying their names. The existing port-3000 review
server remains running. Final built application files match the project files.


## Simple title/description library - 2026-11-23

User-requested scope change supersedes the journey presentation requirement in
previous checkpoints. Renamed the admin navigation, overview card, page and client
panel to Document Library. Removed both client journey/next-action panels, workflow
filters and the admin milestone/stage controls. Main editing fields are Document
title, optional Description and Google Drive file link. Publish/unpublish retains
its confirmation and audit trail, with action-generated reasons. Client entries
show only the shared title, description, date and appropriate open/download action.

No stored journey or prior document history was deleted. Description metadata uses
existing append-only assignment-audit result JSONB, matching the current assignment,
client and revision. Save, publish and unpublish preserve descriptions; old API
requests omitting fields retain their existing metadata. Current-client permission,
URL validation, publication revision, active-publisher checks and no-store headers
are unchanged. Existing protected-download APIs and historical journey APIs remain
compatible, while journey controls are removed from the document UI.

Actual checks: 24 desktop/mobile document component checks passed with mocked APIs;
2 existing client portal layout checks passed. Mobile screenshot was visually
reviewed. Real auth/SQL on a fresh disposable WSL PostgreSQL database: 31 passed
(7 assignment, 8 link/description, 11 protected delivery, 5 Google adapter). The
link suite ran without Google configuration; legacy Google transport was mocked.
All 399 offline regressions, full lint and isolated production build passed.
The retained real-auth browser suite was aligned to the new UI but was not rerun.

No Supabase/Neon writes, real publications, live Google calls, environment changes,
production deployment, commit or push. No schema migration is needed. Review with
the existing admin at /admin/client-documents and client at /?view=documents.

Cleanup for this increment: the single synthetic database and dedicated aoc_links
cluster were removed. Final changed application files match the built snapshot.


## Bounded client document loading - 2026-11-23

Reproduced an indefinite loading state in Chrome by stalling the document API
response: the previous component had no deadline and remained loading after 21
virtual seconds. Added a 20-second deadline covering fetch and response-body
parsing. It aborts the active request and directly shows an actionable error even
if the response never settles. Try again starts a fresh controller. Late requests,
unmount and hidden-tab cancellation cannot overwrite the current result. Returning
to a visible tab rechecks authorization; hidden content is cleared. Invalid HTML
or malformed response shapes now show a safe retry message instead of raw parser
errors. The approved-link data/access model is unchanged.

Read-only diagnostic on the explicitly approved Supabase project found gogrit and
one currently published link; that query completed in 2,323 ms. The anonymous local
API returned 401. No client content, token or password was printed; no records were
modified. This does not identify the original browser request's network-stall cause
or claim an authenticated inspection of the user's current Chrome session.

Actual results: 16 desktop/mobile browser checks passed using fixture APIs, including
stalled-response timeout/recovery, malformed body recovery, visibility/revocation and
the simple publication/library workflow. Changed-file/test lint and isolated
production build passed. No database writes, schema/environment changes, provider
calls, deployment, commit or push. Existing published files remain preserved.


## Initial document list rendered on the server - 2026-11-23

The timeout increment alone did not resolve the user's observed loading screen.
First verified the complete existing sign-in/save/publish/client-list/reload flow
in a clean Chrome context against the isolated full app and disposable PostgreSQL:
both initial and reload document API responses were 200, with no page errors.
This does not reproduce or identify the cause in the user's existing Chrome.

Implemented a request-scoped initial list in app/page.js for the authorized
Documents view, calling the existing clientDocumentList authorization path.
ClientPortal passes a client-bound initial result to ClientOfficialDocuments.
The library renders that list in server HTML and does not immediately replace it
with an initial browser fetch. Error results show a generic actionable retry;
foreign-client initial results are ignored. Search/paging/retry/visibility still
use existing authorized no-store API reads and the 20-second full-response bound.
No shared server/browser cache, credentials, provider permissions or CSP changes.

Actual final checks:
- 24 desktop/mobile component-browser checks passed: publication, edited
  descriptions, draft visibility, unpublish, retries, stalled/malformed requests,
  scoped initial results, safe errors and tab-return revocation. APIs mocked.
- 4 full Next app Chrome checks passed using real Better Auth and disposable
  PostgreSQL, including blocked initial browser document API, JavaScript disabled,
  unrelated-client HTML/list denial and active-session membership revocation.
  These call the real application source and existing API; Google is not contacted.
- 31 database-suite reported passes on disposable PostgreSQL during this
  investigation (including parent tests); legacy Google transport mocked.
- 399 offline tests passed; changed-source/test lint and isolated production
  build passed. No new skipped tests in these runs.

Early verification found two test-harness mistakes: a nonexistent membership id
instead of the existing composite key, and an ambiguous alert selector matching
Next's route announcer. Corrected both. The visibility test now explicitly waits
for hydration before dispatching its event; all affected checks passed afterward.

No live Google file/permission check, authenticated inspection of the user's
Chrome profile or deployment is claimed. No real account/file changes, schema
migration, environment edit, remote database write, commit or push. Main review
server on port 3000 remains running; isolated test server was stopped.

Final cleanup: dedicated synthetic PostgreSQL cluster removed after verifying its
only non-template databases were postgres and the generated test database. Main
review server on port 3000 was preserved. Shared dates use an explicit locale and
UTC to keep server/client markup consistent across browser timezone settings.


## Admin credit-request review flow - 2026-11-23

User reported confusing admin UI after requesting 200 through gogrit. Reviewed
the existing /admin/credits components: pending requests were below the monthly
plan and top-up forms, with only an immediate decline action. Approval required
manually choosing the related request in a separate paid-credit form. The client
request is a free-text note; its number does not identify a verified price or an
approved quantity. Did not impersonate the user's current Chrome session or
approve/decline the actual gogrit request.

Changes in real project paths:
- components/credits/admin-plan-requests.js: request-first table above forms,
  pending count, original message/date, explicit review action and resolved
  history. Decline requires a reason and confirmation; failed retries retain
  the same operation key. Mobile rows show all fields/actions without swiping.
- components/credits/admin-client-plan.js: review opens the matching credit form
  with its request preselected. Agreed credits and actual payment remain separate
  blank inputs; no amount is guessed from the client's note. Monthly activation
  is required when no paid month exists. Paid additions precede monthly settings,
  while upgrade review focuses monthly settings. Success explicitly says when
  the linked request was approved. The existing server transaction/idempotency,
  authorization, confirmed-payment requirements and balances are unchanged.
- components/credits/admin-plans.js and credits.module.css: clearer client picker,
  selected-client identity, payment guidance and responsive request presentation.
- Retained tests: tests/admin-readiness/browser/credit-requests.spec.mjs; existing
  plans.spec.mjs regressions unchanged. The isolated plans fixture uses its own
  route for client switching; the real application defaults to /admin/credits.

Actual results: 26 desktop/mobile Playwright checks passed (12 new request-flow
checks and 14 existing plan/client regressions), 399 offline Node tests passed,
changed-source/test lint passed and isolated production build passed. Browser
APIs were intercepted fixtures: no actual payment, provider call or real request
mutation. Checks cover unpaid-month routing, linked credit approval, no write on
review, decline/cancel/reason, retry keys, workspace switch and unchanged paid
monthly settings. Inspected desktop/mobile screenshots; mobile table no longer
needs horizontal scrolling. Initial failures were exact getByLabel selectors
that included nested option text; corrected to role/name combobox selectors.

No schema/backend/auth/environment change, remote database write, live payment,
email, commit or push. No new configuration. Real request approval and actual
account review remain for the user. Upgrade approval continues to use the existing
manual monthly-settings/linked-credit process; no automated charging or dedicated
new upgrade decision API was introduced. Main server on port 3000 kept running;
isolated browser server is stopped by Playwright after verification.

Review: /admin/credits as the existing authorized AOC admin, choose gogrit, then
use Review & add credits (or Activate monthly plan for an unpaid month). Confirm
the agreed credit quantity, actual payment and reference before final submission.


## Original request versus actual credit grant - 2026-11-23

Follow-up screenshot showed a request message of 200 credits, a confirmed grant
of 150, and history labeled only Approved. The request note is free text and
must stay unchanged. No numeric request amount is guessed or invented from it.

readClientPlan now includes granted_credits and granted_period from the existing
portal_client_plan_topups rows linked by BOTH request_id and client_id. This is
a parameterized, provider-neutral, read-only extension of the existing query;
no schema migration, data rewrite or credentials/configuration change. Existing
correctly linked top-ups become visible on the next read. Payment amounts,
references and admin audit details are not added to client-facing request data.

Admin history separates Original client message, Credits actually added and
Decision. Stored approved status is presented as Closed, with the exact recorded
grant/month beside it. Client history shows the same original message and actual
grant. Older closed requests without a linked grant say Amount not recorded;
they never infer the quantity from the note or unrelated balance additions.
The review and save feedback explain the actual grant and that the request
closes at that quantity. No remaining portion is queued automatically; no new
partial-request/remainder workflow or automatic payment was introduced.

Changed source: lib/client-plan-store.js, components/credits/request-grant.js,
admin-plan-requests.js, admin-client-plan.js, client-plan-view.js and shared CSS.
Extended scripts/check-client-plans-database.mjs and credit-requests.spec.mjs.

Actual verification:
- Real disposable WSL PostgreSQL 18, ordinary non-owner runtime role: existing
  plan activation/authorization/idempotency/immutability/audit grants checks pass,
  plus requests of 200 with grants of 150/200/300, exact linked month, retry
  totals, foreign-client denial, payment-reference privacy, pending/declined
  null grants and exclusion of unlinked top-ups. Checks used synthetic records.
- 36 desktop/mobile browser checks pass with fixture APIs, including admin and
  client history, lower/equal/higher grants and missing transaction history.
  Inspected both desktop/mobile requested-200/granted-150 screenshots. Initial
  three mobile failures were exact cell-name assertions including CSS column
  labels; corrected selectors, then all 36 passed.
- 399 offline tests, changed-source/test lint and isolated production build pass.

The local aoc_credit_review cluster was removed after confirming its only
non-template databases were postgres and the generated aoc_documents test DB.
Fixture browser server stopped automatically; main port 3000 kept running.
No real client request/balance/payment edit, Supabase/Neon access, deployment,
commit or push. Current account/provider verification remains user review.
Refresh /admin/credits or the client plan history; no setup or migration needed.


## Saved monthly plan: summary, explicit editing and cancel - 2026-11-23

Saved plans now default to a compact read-only summary of saved portal price,
included monthly credits and status. Edit monthly plan opens the existing form
and focuses its first field. Cancel editing unmounts the draft and reopens from
saved data; it does not submit. New clients keep the initial setup form open.
An unpaid saved month has an explicit Activate this month entry point; opening
it never confirms payment. Existing credit-request review can open the editor
for activation/upgrades. Saving returns to the summary once refreshed saved
version/month data arrives, with success feedback retained. Failed saves keep
the form and retry key; failed refresh keeps the confirmed-change warning.

Changed real paths: components/credits/admin-client-plan.js, credits.module.css,
tests/admin-readiness/browser/plans.spec.mjs and credit-requests.spec.mjs.
Actual checks: 42 desktop/mobile fixture-browser cases passed, including cancel
after review, reset drafts/payment fields, client switching, unpaid activation,
failed-save retry, failed-refresh recovery and earlier credit-grant regressions.
Changed-source/test lint and isolated production build passed. Inspected saved
summary screenshot; browser APIs mocked. No database/provider writes, backend,
schema, environment or Internal Portal changes. Existing user edits preserved;
no commit/push. Main review server on 3000 remains running. Review /admin/credits.


## Screenshot-tool document flicker - 2026-11-23

The client document component explicitly aborted/cleared its current list on
hidden visibility transitions. Screenshot overlays can cause those transitions,
which replaced Shared documents with Loading your documents on return.
Removed hidden-state clearing and cancellation. Existing rendered client data
and initial in-flight reads now survive capture. Returning visible still performs
an authorized no-store recheck while retaining the list; in-flight coalescing
prevents repeated visibility/focus signals from starting duplicate reads.

Search/paging still clear their old results intentionally. The 20-second response
deadline, retry/error behavior, unmount cancellation and scope keys remain.
A denied recheck clears previously displayed content; client switching cannot
restore an old response. Previously rendered metadata may remain visible until
that recheck completes; this does not grant file access. Download/open handlers
continue to authorize each request. No shared cache or new revocation guarantee.
This supersedes the earlier immediate hidden-tab clearing described above.

Actual results: 44 desktop/mobile fixture-browser checks passed, including
screenshot-like hidden/visible/blur/focus transitions, retained list/search draft,
one document navigation only, coalesced requests, initial in-flight reads,
revoked access, client switching and existing admin document regressions.
Changed-source/test lint and isolated production build passed. Inspected the
capture screenshot. Native Lightshot was not driven; browser events and API
responses were controlled fixtures. No real documents, database, provider,
credentials or environment changes, no commit/push. Main review server on 3000
remains running; the fixture server was stopped automatically after tests.
Changed real files: components/portal/client-official-documents.js and
tests/admin-readiness/browser/document-loading.spec.mjs, plus these notes.


## File-aware document open buttons - 2026-11-23

Replaced the blanket Open in Google Drive button with labels based on available
file evidence: Google Docs/Sheets/Slides links identify the relevant application;
PDF, Office, spreadsheet/CSV, presentation, image and text MIME/extensions identify
the action. Unknown/opaque links show Open file. No Google fetch/metadata lookup
is added. For opaque Drive IDs without MIME data, the approved display-title
extension is only a presentation hint, not verified file content. Protected native
Google documents are exported by the existing route as PDF, so their label is
View PDF rather than a misleading Google editor action.

lib/document-open-label.js is pure presentation policy. lib/document-delivery.js
uses already-authorized assignment source_url internally and returns only the
computed viewLabel; original Drive URLs/IDs are not added to client JSON. Existing
client-approved title/description, revision binding, visibility behavior, private
download URLs and file validation are unchanged. No migration/new environment
variables. The client component uses the server label, with an extension-based
fallback for older payloads. Download behavior is unchanged.

Actual results: 46 desktop/mobile fixture-browser checks passed, including action
labels and existing publication, visibility, revocation and scope regressions;
402 offline Node tests passed (including three new label-policy groups), lint and
isolated production build passed. All four real disposable WSL PostgreSQL suites
passed: 7 assignments, 8 simple-links, 11 protected-delivery and 5 Google-adapter
reported tests (31 including parent tests); provider transport mocked. The link
suite checks the actual Docs label and preserves the raw-source non-disclosure
assertion. Retained real-auth browser label assertion updated, not rerun here.

No actual client record, provider file, remote Supabase/Neon database, credentials
or environment changed. The generated test database and dedicated aoc_links
cluster were verified and removed. Main review server on 3000 kept running;
fixture browser server stops automatically. No commit/push. Refresh the client
Documents view to see labels for existing files; no re-upload required.

## Compact document cards and global Consolas — 2026-11-23

Applied the requested Consolas stack globally through app/globals.css, including
inherited form controls and code text. Devices without Consolas use a local
monospace fallback; no font downloads or new dependencies were added. ChatKit's
installed typography API receives the same normal/code font stack because its
frame does not inherit page CSS. Live ChatKit font rendering remains unverified.

The admin Document Library now gives more width to saved documents and places
cards side by side where space permits. Each card has one shared action group
for Open in Drive, Edit, Publish/Unpublish and Remove. Controls fill the available
width and wrap into balanced rows on smaller cards. Confirmation forms remain
inline with their existing review/reason requirements; disclosure buttons expose
expanded state. Labels, spacing and metadata are tighter; full source links remain
available through Open and the URL tooltip. The Save button aligns to the form end.
Only presentation/composition changed; API commands, client scoping, confirmation,
retry keys and publication/removal persistence remain on their existing paths.

Verification: 46 existing desktop/mobile document browser checks passed using
mocked API responses and database access disabled. Five additional temporary
visual checks passed at widths 1680, 1280, 1024, 768 and 390: computed Consolas
inheritance, action containment, no horizontal page overflow, and inline
publication open/cancel behavior. Desktop/mobile screenshots were inspected.
Changed-component lint, git diff --check and an isolated production build passed.
No database/provider writes, environment changes, deployment, commit or push in
this presentation step. The review server was preserved; temporary browser
servers stopped automatically. Review /admin/client-documents in the local portal.

Changed source: app/globals.css,
components/ai-assistant/chatkit-assistant.js,
components/admin/client-document-assignments.js,
components/admin/client-document-assignments.module.css and
components/admin/document-link-publication.js. Existing local edits preserved.

## Client-grouped document tables — 2026-11-23

Replaced the large client picker/empty landing block and document cards with
client-grouped tables. Client rows show name/account, portal access and a library
disclosure. Clicking anywhere on a summary row or its keyboard-accessible button
expands/collapses the client. Only the selected client's existing authorized API
data is loaded; switching/closing a group unmounts the previous client panel.

Within a group, rows show document title, publication visibility and updated date
(UTC). A row expands into description, original Google link, available file size
and Open attached file / Edit / Publish or Unpublish / Delete actions. The
existing review, reason, revision and idempotency checks remain in place. Delete
uses the existing archive command, retaining history and the original Drive file.
The add/edit form opens on demand and closes after a successful save. Existing
per-client draft preservation, quiet refresh and authorization-denial behavior
remain covered. The existing optional protected-delivery path is retained below.

Added client-name/account search; per-client document title/description search;
newest/oldest/title sorting; and published/private-draft filters. File-size sorts
work only for rows with supplied numeric byte metadata; unknown sizes sort last.
The current saved-link API supplies no verified sizes: those display Not provided
in expanded details and size sorting is disabled with an explanation. No Google
metadata fetch or guessed byte count was introduced. Tests supplying synthetic
size metadata demonstrate conditional UI behavior, not live provider support.
Search/sorting cover the existing latest-100 list; an explicit note appears when
100 records are returned. This step adds no global cross-client document search,
pagination, schema migration, environment setting or provider connection.

Actual results: 52 focused desktop/mobile fixture-browser checks passed, covering
the new disclosure/search/date/title/metadata-size/visibility behavior, delete
confirmation and existing publication, retry, revocation, saved drafts, screenshot
focus, stale-response and client-switching regressions. Changed source/tests lint
and git diff --check passed; isolated production build passed. Inspected desktop
and mobile screenshots of expanded tables and actions. Real-auth database browser
selectors were updated for the new navigation, but that disposable database suite
was not rerun in this presentation step. No live provider verification was run.

Changed source: components/admin/client-document-assignments.js and its CSS
module. Updated tests/admin-readiness/browser/{document-links,documents}.spec.mjs
and tests/client-document-assignments/browser/assignments.spec.mjs. Existing
Consolas configuration, server authorization, persistence, original client IDs,
document links and unrelated local changes were preserved. No database/provider
writes, real file deletion, dotenv changes, deployment, commit or push. Fixture
servers stopped automatically and the primary review server was left running.
Review the local /admin/client-documents route with an authorized AOC admin.

## Simpler sharing and real private uploads — 2026-11-23

Supersedes the nested-table interaction above. One client selector, an always
visible drag/drop or Drive-link form and direct row actions replace the multiple
expansion/add/publish steps. File names fill titles; descriptions are optional.
Save & share explicitly saves/publicizes a reviewed file or link in one action;
Save draft retains privacy. Existing link save operations remain private and
separate publish callers still require confirmation. One-step link sharing uses
the same locked transaction/audit receipt and retains legacy category/stage
metadata. Edit, Share/Unshare and Delete are visible without expanding rows.
Delete/Unshare confirmations remain, with automatic business audit reasons.

Added durable, bounded PostgreSQL file bytes and append-only upload audit, reusing
the application's portable storage/authorization pattern, not a provider SDK or
Vercel disk. New server-only routes create/update and preview admin files; the
existing authenticated client document list/download paths include shared uploads.
IDs, revisions, client scope, active membership and publisher state are rechecked;
bytes are not released on denial. Files are not sent to AI or external storage.
Size sorting now uses real uploaded-byte sizes; opaque Drive links stay unknown.
2 MiB per file; 100 MiB retained bytes per client and 30 uploads/client/creator/day.
Archive retains private bytes/audit, and future retention cleanup is not included.

Actual final verification:

- 407 offline Node tests passed; zero failures/skips.
- 58 desktop/mobile fixture-browser checks passed, including actual file-input
  and drag/drop UI, filename defaults, private drafts, missing setup, retries,
  direct actions, search/sort, client switching, screenshot focus and revoked
  access. API/provider responses in these browser checks were mocked.
- 39 reported real-auth/disposable PostgreSQL tests passed across assignments
  (7), links (9), uploaded files (7), protected Google delivery (11), Google
  adapter (5); these include five parent tests. Google transport was mocked.
  Both migrations ran twice on each fresh fixture database. The upload suite
  verifies exact byte persistence, concurrent replay, scope/revocation, old URL
  denial, inline/download headers, forbidden actors and browser-role SQL grants.
  A deliberately permissive browser-role default grant was revoked by migration.
- Changed-source/test lint, git diff --check and isolated production build passed.
- Desktop/mobile upload screens inspected. No live AI/Google/email/payment or
  real customer-file verification performed. Real-auth browser selectors were
  aligned, but that separate retained DB-browser suite was not rerun.

Additive upload migration applied to the approved Supabase target after rehearsal;
new tables/role grants and browser denial verified. Existing client/reference
counts unchanged and zero real uploads created. No Neon access, environment file
change, Git commit, push or deployment. New runtime configuration is not needed.
The primary review server remains available at /admin/client-documents. Existing
approved Google links, conversations, credits, resources, knowledge, indexing and
Internal Portal functionality remain on their existing paths.

Files: database/client-document-files.sql; scripts/migrate-client-document-files.mjs;
lib/client-document-file-policy.js; lib/client-document-files.js; existing link
policy/store and document-delivery.js; new admin file POST/GET routes; admin
document component/CSS; admin audit manifest; package script; pure, database and
browser tests; setup/portability/progress/UI documentation. All intended source
lives under actual project paths; ignored .tmp holds only scratch/private fixtures.

Remaining deployment work: publish/review the source and deploy Next.js with the
existing Supabase certificate packaging. Larger-file direct object storage,
antivirus scanning, retention purge, real customer-file/provider checks and the
previous Vercel AI/deployment checks remain outside this completed local slice.

Final follow-through: private/share checkbox choices are included in the
client-scoped draft, so switching clients cannot turn a private unfinished draft
into an automatically shared one. This case passed in the final 58-check browser
run. The final changed-source lint/build passed after that fix. All five generated
databases and the dedicated aoc_uploads cluster were verified and removed; the
existing WSL main cluster and primary portal review server were preserved.
No real customer files were added or downloaded during verification.


## 2026-11-23 — Shared interactive dropdown styling

Applied one shared single-value dropdown treatment in app/globals.css. The current
inventory contains 54 select controls across 23 application/component files:
Admin, client, Internal Portal, builder and debugger. This is a visual enhancement;
existing values, permissions, onChange handlers, server forms and database paths
are preserved. The current locally edited font setting is retained.

Current Chrome uses customizable select pickers (appearance: base-select), with
rounded blue borders, an animated chevron, a selected checkmark, distinct hover
and keyboard focus states, disabled states, a bounded scrollable option list,
and top-layer menus that escape clipped cards. Reduced-motion preferences disable
the picker/arrow animations. Typing jumps to matching options through the browser's
typeahead; this does not introduce a separate search field. No JavaScript library
or client bundle code is added.

Browser limitation: unsupported browsers retain a styled closed control and their
operating-system option menu. Firefox/Safari were not exercised. Embedded ChatKit
iframe UI is owned by its SDK and is outside the application's global stylesheet.
Reference: https://developer.chrome.com/docs/modern-web-guidance/guides/forms/branded-select-styling

Files: app/globals.css; tests/client-readiness/ui/app/dropdowns/page.js;
tests/admin-readiness/browser/dropdowns.spec.mjs; this review record.
The dropdown page exists only in the isolated test app, not as a portal route.

Actual verification, with real database/provider settings cleared in the child
process environment:

- Passed: combined desktop/mobile Chrome fixture run, 68 checks (10 initial
  dropdown checks plus 58 document-library regressions). Mocked API responses;
  no provider or database verification is implied.
- Passed: final dropdown run, 12 checks, including reduced-motion handling.
  Verified pointer and keyboard selection, typeahead, Escape/outside dismissal,
  disabled controls/fieldset, required validation, GET submission, reset,
  60-option list boundaries, clipped containers, and no horizontal overflow.
  Inspected desktop/mobile screenshots of the open menu.
- Passed: ESLint on the new fixture and browser spec; git diff --check.
- Passed: production build in the isolated .tmp/document-library-build-20261123
  snapshot with the final shared stylesheet copied from the real project.
- Earlier test fixture label selectors failed; explicit label associations fixed
  those fixture errors, and all affected checks passed on rerun.

No database/environment changes, migration, commit, push or deployment were made
for this dropdown work. Existing local changes were preserved. The primary review
server remains on http://127.0.0.1:3000. Live authenticated inspection of every
portal screen and non-Chrome browser verification remain unrun.

Visual follow-through: removed the popup opacity fade after inspecting a mobile screenshot; the menu now stays opaque from the first frame. The final 12 dropdown checks, ESLint and isolated production build passed again after that change. Stable desktop/mobile screenshots were inspected. Existing arrow animation and reduced-motion handling remain.
