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
