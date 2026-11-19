# Agency Platform context

> Stage 12 local console is implemented from `0064754` in `AI\portal` on
> `feat/agency-platform`. Explicit platform owner/operator access, agency metadata
> and audited lifecycle, scoped AOC delivery and status-only dual-consent support
> are locally verified. Synthetic owner only. External agency access remains HOLD;
> Stage 13 is not started. See the latest PROGRESS and Stage 12 runbook.
> Older stage banners below are historical. No Neon changes.

> Latest Stage 11 review from `817c314`: local engineering PASS, external
> rollout HOLD. Runtime guards reject elevated/owner credentials in adopted
> databases; the legacy shared-service trust model remains explicit. Chrome
> BFCache diagnostics confirm no-store/cookie eviction. Stage 12 local work may
> proceed after its own task under disposable fixtures and the closed gate.
> See the latest PROGRESS and ISOLATION-EVIDENCE review; older banners below
> are historical. Neon is untouched.


> Current primary status: Stage 11 local verification and evidence are complete
> on `feat/agency-platform` in `AI\portal`, starting from `d3c9991`. See the latest
> PROGRESS entry and [ISOLATION-EVIDENCE](ISOLATION-EVIDENCE.md). The external
> agency gate stays closed: live provider/CDN/deployment checks and documented
> runtime-role trust acceptance remain pending. Earlier stage banners below are
> historical. Neon is unchanged; stop before Stage 12.


> Current primary status: Stage 10 is locally implemented and verified on
> `feat/agency-platform` in `C:\Users\MY PC\Desktop\AI\portal`, following
> Stage 09 `48a5043` and checkpoint `50c0ee1`. See the latest PROGRESS entry and
> [Stage 10 job contract](STAGE10_JOBS.md). The source-worktree Stage 04 banners
> below are historical. Stage 11 remains gated. Neon is unchanged.


> Primary project handoff: use `C:\Users\MY PC\Desktop\AI\portal`. The results below were recorded in the AOC source worktree. Stage 03–04 code has not yet been imported into this primary checkout. See [HANDOFF](HANDOFF.md) for exact Git files, local-only verification limits and the Stage 05 stop gate.

Current stage: **04 — completed synthetic local ownership/backfill rehearsal**.
Sections 1–18 retain historical inventory, design and Stage 03 results; section 19
records Stage 04. Guarded compatibility is activated only on the migrated local
database. No production or deployment-readiness claim is made. Stop before 05.

Related records: [decisions](DECISIONS.md), [progress and actual checks](PROGRESS.md).

## 1. Audited checkout and comparison target

| Item | Observed value |
| --- | --- |
| Working directory | `C:\Users\MY PC\Desktop\AOC\chatkit` |
| Branch | `master` |
| Current HEAD | `786b3b56468ffda6c1561c21894bb928e15e41d0` |
| HEAD subject | `added /v1/desicion response and source files docs with selectable model on ai admin` |
| Reviewed master | `916bbf5b781ea0dd7b3b685d5517694dad4185a7` |
| Reviewed subject/date | `chatkit commit`; November 18, 2026 |
| Reference availability | Object absent from this checkout; read directly from the existing `Desktop\AI\portal` local repository, whose HEAD is the reviewed commit |
| Committed ancestry | Current HEAD is two commits behind reviewed master; checked in the repository containing both objects |
| Existing local status | 37 tracked modified paths and 27 untracked status entries; some untracked entries represent directories |
| Application change during Stage 01 | None; existing tracked/untracked files and private environment files were fingerprinted for preservation |

No checkout, reset, merge, fetch, commit, deployment, or cross-checkout source copy
was performed. The other checkout supplied committed reference contents only; its
environment and installed packages were not adopted as this checkout's baseline.

The comparison included tracked and nonignored untracked working files, normalized
with Git's content hashing, before creating these Stage 01 documents:

| Compared with reviewed master | File count |
| --- | ---: |
| Same content | 404 |
| Present in both, different content | 102 |
| Present only in reviewed master | 108 |
| Present only in current working tree | 39 |

The current working tree is not an equivalent release of `916bbf5`. Do not port
the reviewed files over this working tree wholesale. Existing changes include
client AI startup, review routing, browser dictation, monthly completed-task
history, source errors, admin indexing UI/queue work, and related tests. Several
of these have different implementations in reviewed master.

### Significant reviewed-master differences

| Capability in `916bbf5` | Current checkout |
| --- | --- |
| Client and AOC Admin AI credit reports/pricing/allowances | Absent: no credits pages, routes, repository or schema here |
| New AI usage-history controls/reset workflow | Absent; current `/api/admin/usage` retains its existing request-allowance reset |
| Website Insights, Google Search Console and PageSpeed reporting | Absent: no `lib/website-insights` or its API routes/dependencies here |
| Dedicated Admin layout/settings and client operations API | Absent; current Admin dashboard owns its existing panels |
| New readiness suites and assistant-access hook | Absent; current checkout has its own client access loader and synthetic Chrome tests |
| New Hubstaff scheduler/monitor | Absent as that implementation; current checkout contains separate, partly integrated queue/parallel-slot changes |

Important semantic drift: current Python code reserves monthly client request
allowance; reviewed-master credit documentation says portal monthly request caps
are disabled and credit allowances are reporting-only. Stage 01 preserves the
current behavior and does not select a new financial or quota policy.

## 2. Stack and setup baseline

- Installed Node.js: **22.22.2**; package requires Node.js 22+.
- Installed Python: **3.13.17**, existing `.venv`; pinned Python version is 3.13.
- Installed Next.js: **16.3.3**, Turbopack; React **19.2.8**.
- Python requirements include ChatKit 1.6.5, Agents 0.22.1, OpenAI SDK 3.10.0,
  FastAPI 0.141.1, Uvicorn 0.52.4 and Psycopg 3.3.5.
- Better Auth owns database-backed username/password accounts and sessions.
- PostgreSQL is accessed through `lib/database.js` in Next.js,
  `lib/postgres.js` in provisioning scripts, and `chatkit_backend/database.py`
  in Python. Provider-neutral SQL is required by `AGENTS.md`.
- Documented deployment: one Vercel Next.js project and a separate Vercel FastAPI
  project rooted at `chatkit_backend`; Python max duration is configured as 120s.
- `npm run dev` launches the local web/Python services and an explicit-index queue
  worker. It can also launch a Drive worker. Starting it is not a read-only check.

Read for this stage: root `AGENTS.md`, `README.md`, `package.json`,
`docs/CHATKIT_SETUP.md`, `docs/DATABASE_PORTABILITY.md`, relevant route/data/job
implementations, and installed Next.js route, client-component, Strict Mode and
build-directory documentation. The three agency-platform records did not
previously exist. No framework code was edited.

`setup:preview` passed without installs or environment changes. Actual setup was
not needed: dependencies were installed, Python's dependency check passed, and
the baseline build passed. On a fresh checkout, preview setup, stop that checkout's
services, run setup as needed, then privately configure the intended environment
before schema checks or starting workers.

## 3. Database and test target

The current `.env.local` contains a PostgreSQL URL classified privately as a
**remote Neon target**. The hostname/database/credentials are deliberately not
copied here. Its purpose was not established as disposable or approved staging;
a name hint is not approval. No dedicated test-database setting was found.

**No database connection, schema probe, migration, provider request, Make webhook,
real message or payment action was made for Stage 01.** Tests received no live
database/provider/webhook credentials. The build used a deliberately unreachable
loopback database/backend and synthetic secrets, with application environment
values withheld; generated build output is validation output, not a deployment.

Before any future test write, designate a disposable PostgreSQL database or an
approved Neon staging branch. Confirm it is not production, select its private
connection settings, and use synthetic fixtures. Many `scripts/check-*-database`
commands read `DATABASE_URL` directly; a test-like command name is not a safety
boundary. Existing opt-in suites also use `HUBSTAFF_SEARCH_TEST_DATABASE_URL` and
`HUBSTAFF_QUEUE_TEST_DATABASE_URL`.

Do not assume an authenticated GET is write-free. Existing context resolution can
upsert portal users; audit reads can emit audit events; cache reads can trigger
provider refreshes/cache/audit writes. Reviewed-master credit GETs can reconcile
derived reporting entries. These paths require the same target review as explicit
mutation routes.

## 4. Identity and portal boundaries

| Area | Existing boundary and reusable path |
| --- | --- |
| Shared login | Better Auth `/api/auth/[...all]`, `lib/auth.js`; sign-up is disabled for ordinary runtime. Provisioning paths enable server-side account creation explicitly. |
| Client Portal | `/`; `resolvePortalContext` derives a membership from the authenticated external user and active-client cookie. Memberships are server-verified; prompt-supplied client/project IDs are not authority. |
| Client roles | `client_viewer`: overview/documents; `member`: adds contribution/AI; `client_admin`: adds document/member management and access audit. Legacy membership `aoc_admin` does not grant AOC-wide administrator access. |
| Client AI/data | `getPortalAiContext`, scoped conversations/files and stale-account checks. Python repeats membership, client enablement, conversation ownership and Work/General mode checks. |
| AOC Admin | `/admin`, `/builder`; `resolveAdminContext` requires active `portal_admins` membership and rejects Internal-user identities. Client Administrator is not AOC Admin. |
| Internal Portal | `/internal/**`; `resolveInternalUserContext` requires an active internal record, then evaluates roles, panels and permissions before data/cache access. |
| Internal-only accounts | `assertNotInternalUser` prevents active and inactive Internal identities from falling back to Client/AOC Admin privileges. |
| Internal management | Access Manager/Internal Admin policies protect provisioning, positions, panels, role grants, password resets and protected-role/self/last-manager cases. Internal Admin assignment remains owner-controlled. |
| Internal organization data | Team directory, derived work status, HR details and Project Management are distinct scopes; per-user My Work is not a client project scope. Planned role names do not imply implemented readers or permissions. |
| Debugger | Optional, authenticated session/cookie-bound inspector. No shared cross-account trace collector; retired collection routes return 404. |

These are application-enforced client/user scopes in a shared PostgreSQL database,
not a reviewed multi-agency data model. There is no established `agency_id`
boundary for the global settings below. Supabase Auth/Storage or browser database
access would each require a separate architecture decision.

## 5. Sensitive shared resources

| Resource | Existing scope / sensitivity / reuse constraint |
| --- | --- |
| Better Auth tables and auth secret | Shared identities, passwords, sessions and rate-limit storage. Preserve IDs, hashes and session/secret relationships. |
| AI credentials and active provider/model | Site-wide encrypted provider records and singleton selection in `portal_ai_credentials`, `portal_ai_active_provider`, `portal_site_ai_settings`; shared by client/Admin/builder AI paths. Same stable encryption setting is required on Node and Python. |
| Backend signing secret | Shared Next.js/Python trust boundary; signed bodies include server-established client/user scope. Not a browser credential. |
| Drive connection/source cache | Admin-owned read-only Google grant, approved root and encryption setting; shared `clients` publications, private admin packs and optional client packs are different audiences. A shared publication reaches every applicable client. |
| Hubstaff client integration | Server-side PAT/access credentials can serve multiple client project mappings. Credential rotation affects encrypted token state and index bindings; never substitute a prompt URL for the approved mapping. |
| Internal Hubstaff | Personal encrypted connections and approved member mappings differ from organization-level directory/HR/PM readers. Organization tokens/team IDs and role gates are sensitive shared dependencies. |
| Internal snapshots | `portal_internal_sync_snapshots` can contain HR leave/balance/schedule details; scope digests and permissions are not a substitute for database/backup/retention controls. |
| Make webhook | Server-only global destination; even a connection-test event can execute a real Make scenario. Do not call it in baseline tests. |
| Audit/usage/cost data | Staff-wide reports contain cross-client operational/financial metadata; client audit is scoped. Deleted-client cost rows can retain an archived/null client reference. |
| Stored files and model indexes | Conversation uploads, generated files, client library and optional OpenAI vector stores have different ownership and external-upload/cost consequences. |
| Cron secrets and jobs | Source sync and Hubstaff indexing can write shared derived state without browser login; bearer secrets, leases, bindings and approved scheduling are required. |

## 6. Tenant data inventory

Table names below are a source/schema inventory, **not confirmation that the
configured database has these migrations**.

| Domain | Tables / key ownership |
| --- | --- |
| Auth | Better Auth `user`, `session`, `account`, `verification`, `rateLimit`; external IDs link to portal users |
| Client identity | `portal_clients`, `portal_users`, `portal_memberships`; active role per user/client |
| Legacy workspace | `portal_workspace_snapshots`, `portal_knowledge_items`; client/user scoping and retained archive |
| Client access audit | `portal_client_access_audit`; member/role changes for one client |
| ChatKit history | `portal_chatkit_threads`, `portal_chatkit_items`, `portal_chatkit_leases`; compound client/user/thread ownership and stored chat mode |
| Assistant publishing/files | `portal_assistant_configs`, `portal_assistant_versions`, `portal_assistant_tool_usage`, `portal_assistant_preview_usage`, `portal_assistant_files`; client settings and preview/user ownership |
| Attachments/library | `portal_chatkit_uploads`, `portal_chatkit_upload_attempts`, `portal_client_library`; client/user attachment checks; separately client-scoped persistent library |
| AOC Admin/provider | `portal_admins`, `portal_ai_credentials`, `portal_ai_active_provider`, `portal_site_ai_settings`; site-wide authority/settings |
| Usage/cost | `portal_ai_usage_monthly`, `portal_ai_activity_monthly`, `portal_ai_provider_status`, `portal_ai_usage_events`, `portal_ai_cost_state`, `portal_ai_cost_events` |
| Drive | `portal_drive_source_connections`, `portal_drive_source_oauth_states`, `portal_prepared_source_indexes`, `portal_source_publications`; owner, connection binding and approved audience |
| Hubstaff | `portal_hubstaff_tokens`, `portal_hubstaff_search_indexes`, `portal_hubstaff_search_tasks`, `portal_hubstaff_search_comments`; provider credentials versus client/project-bound index |
| Local queue additions | `portal_hubstaff_index_jobs`, `portal_hubstaff_index_worker`, `portal_hubstaff_index_slots`, `portal_hubstaff_index_rate_limits`; migrations are local work, installation unverified |
| Internal identity/policy | `portal_internal_users`, `portal_internal_user_roles`, `portal_internal_schema_migrations`, `portal_internal_access_audit`; internal identity, encrypted connection, panels and roles |
| Internal cache | `portal_internal_sync_settings`, `portal_internal_sync_settings_audit`, `portal_internal_sync_snapshots`; feed settings and scoped snapshots |
| Operational audit | `portal_integration_runs`, `portal_audit_events`; source operation/outcome and allowlisted client/Admin actions |
| Credits, reviewed master only | `portal_ai_credit_pricing`, `portal_ai_credit_periods`, `portal_ai_credit_entries`; absent from this checkout |

## 7. Next.js page entry points

All 18 source `page.js` entries are accounted for below. `/employee/**` and
`/api/employee/**` redirect to their Internal equivalents through `next.config.mjs`.
Client dashboard sections are panels on `/`, not additional page routes.

| Path(s) | Boundary / purpose |
| --- | --- |
| `/login` | Shared sign-in; no public registration page |
| `/` | Authenticated client shell; redirects appropriate account types to Admin/Internal; optional own-session debugger view |
| `/admin` | AOC Admin clients, AI/usage/provider/integration controls |
| `/admin/audit` | AOC-wide client/Admin operational audit |
| `/admin/sources` | AOC Admin company knowledge/Drive publications |
| `/admin/hubstaff-index` | Compatibility redirect to `/admin#clients`; current local UI puts indexing in client controls |
| `/builder` | AOC Admin client assistant drafts, preview and publishing |
| `/internal` | Internal My Work |
| `/internal/team` | Internal authorized Team workspace |
| `/internal/settings` | Internal account/settings workspace |
| `/internal/roles` | Authorized role workspace navigation |
| `/internal/roles/[role]` | Role/panel-permitted workspace, e.g. implemented HR/PM |
| `/internal/audit` | Internal Admin operational/access audit |
| `/internal/internal-settings` | Authorized internal-user management |
| `/internal/internal-settings/integrations` | Authorized organization integration controls |
| `/internal/internal-settings/sync` | Authorized Internal cache freshness controls |
| `/debugger-lab` | Feature-gated diagnostic fixture page |
| `/debugger-lab/workflow` | Feature-gated workflow diagnostic fixture |

Framework-generated not-found handling and `proxy.js` are additional platform
surfaces. The proxy provides CSP/nonces and debugger routing, not tenant authorization.

## 8. Next.js handler inventory

All **53** source `route.js` files are listed. Authorization often occurs in a
called data helper rather than directly in the route. Helper names alone are not
proof of the audience: internal-user management/member-selection helpers retain
`Admin` in their names and live in `lib/admin-data.js`, but their actual guards
require Internal management permissions.

| Path | Methods | Audience / working path to reuse |
| --- | --- | --- |
| `/api/auth/[...all]` | GET, POST, PATCH, PUT, DELETE | Configured Better Auth handlers; shared sign-in/session/password surface |
| `/api/session/client` | PUT | Authenticated membership-checked active-client cookie change; existing SameSite policy; no explicit trusted-origin helper in this handler |
| `/api/workspace` | GET | Scoped client workspace/legacy archive via `loadPortalWorkspace` |
| `/api/presence` | POST | Authenticated client presence; trusted-origin check |
| `/api/ai-access` | GET | Client AI permission and allowance display via `loadPortalAiAccess` |
| `/api/chatkit` | POST | Client AI permission, active-client/mode/thread checks, prepared/live project context, signed Python proxy |
| `/api/chatkit/upload` | POST | Client AI/upload and stale-client checks; signed private upload proxy |
| `/api/chatkit/transcribe` | POST | Retired paid transcription; 410 browser-dictation-only response |
| `/api/conversations` | GET, PATCH, DELETE | Scoped user/client/mode history and mutations |
| `/api/client-library` | GET, POST, DELETE | Client-scoped library and contribution/removal permissions in library helpers |
| `/api/client-library/[id]` | GET | Authorized private client-library file download |
| `/api/assistant-files/[id]` | GET | Requesting user/client generated file or authorized Admin preview file |
| `/api/client/members` | GET, POST, PATCH | Client Administrator membership management with protected-grant policies |
| `/api/client/password` | POST | Own authenticated client password change |
| `/api/client/audit` | GET | Authorized client audit view; scoped queries and audited read |
| `/api/hubstaff` | GET | Selected client's approved project/time summary |
| `/api/hubstaff/workflow` | GET | Selected client's live approved board |
| `/api/hubstaff/tasks` | GET | Selected client's verified list/task/history reads and pagination |
| `/api/builder` | GET, POST | AOC Admin draft/publish/version operations through builder helpers |
| `/api/builder/preview` | POST | AOC Admin signed Python draft test; separate preview limits/files |
| `/api/admin/clients` | GET, POST, PATCH | AOC Admin client setup/settings; local code also enqueues requested indexing |
| `/api/admin/presence` | GET | AOC Admin cross-client presence |
| `/api/admin/assistant` | GET, POST, PUT | AOC Admin private assistant/history and approved source/client context |
| `/api/admin/provider-settings` | GET, POST, PUT | AOC Admin global provider/model/catalog/access checks/settings |
| `/api/admin/ai-usage` | GET | AOC Admin AI action/usage reporting |
| `/api/admin/ai-spending` | GET | AOC Admin monthly cost ledger and CSV |
| `/api/admin/audit` | GET | AOC Admin audited operational view |
| `/api/admin/usage` | POST | AOC Admin current client request-allowance reset |
| `/api/admin/make/test` | POST | AOC Admin trusted mutation; actual Make event plus integration-run writes |
| `/api/admin/hubstaff-index` | GET, POST | AOC Admin client indexing status/enqueue |
| `/api/admin/source-connections` | GET, POST | AOC Admin Drive status/connect/discover/preview/disconnect |
| `/api/admin/source-connections/callback` | GET | AOC Admin session/state/PKCE-bound Google OAuth callback |
| `/api/admin/source-connections/prepared` | GET, POST | AOC Admin source preparation/publication, audience consent and owner checks |
| `/api/admin/source-connections/test` | GET, POST | AOC Admin private source AI test; named live operation can call providers |
| `/api/internal/dashboard` | GET | Active Internal identity and workspace/panel policy |
| `/api/internal/connection` | POST | Own Internal Hubstaff connection, verified provider identity |
| `/api/internal/connection/unlink` | POST | Own Internal connection removal |
| `/api/internal/hubstaff/oauth/start` | POST | Own Internal OAuth initiation with session/CSRF protections |
| `/api/internal/hubstaff/oauth/callback` | GET | Own Internal OAuth callback and identity verification |
| `/api/internal/hr` | GET | Internal HR/Internal Admin permission-filtered details |
| `/api/internal/project-management` | GET | Internal PM/Internal Admin authorized organization/project reads |
| `/api/internal/integration-settings` | GET, POST | Authorized Internal settings; POST performs a real Hubstaff integration test |
| `/api/internal/sync-settings` | GET, PUT | Internal settings policy; cache feed intervals and audited updates |
| `/api/internal/password` | POST, PUT | Own Internal password change or separately authorized reset |
| `/api/internal/audit` | GET | Internal Admin audit policy; run/access metadata |
| `/api/internal/internal-users` | GET, POST, PATCH, PUT | Helpers in `lib/admin-data.js` require the relevant `internal_users.*` Internal management permissions and protected-role policy |
| `/api/internal/hubstaff-members` | GET | Internal management permission `internal_users.create`; `loadAvailableAdminHubstaffMembers` is not an AOC Admin grant |
| `/api/cron/source-sync` | GET | Server bearer secret; source sync writes; no browser identity |
| `/api/cron/hubstaff-index` | GET | Server bearer secret; queue/index maintenance writes |
| `/api/debugger/session` | GET | Feature flag plus authenticated own-session debugger token |
| `/api/debugger/backend` | POST | Retired collector; 404 |
| `/api/debugger/events` | GET, POST | Retired collector; 404 |
| `/debugger-lab/[asset]` | GET | Feature-gated own-session diagnostic asset allowlist |

### Reviewed-master-only tenant/admin entry points

These are absent locally and were inspected as committed reference features, not
executed or imported:

- Pages: `/credits`, `/admin/credits`, `/admin/settings`; an Admin layout is also new.
- Client handlers: `GET /api/credits`; `GET/POST /api/client/website-insights`;
  `POST /api/client/website-insights/google`;
  `GET /api/client/website-insights/google/callback`.
- Admin handlers: `GET/POST /api/admin/credits`,
  `GET /api/admin/client-operations`, `POST /api/admin/ai-usage/history`.
  Consult their committed handlers before reuse; they are not validated local APIs.

## 9. Python entry points and tool surfaces

| Entry point | Boundary / behavior |
| --- | --- |
| `GET /health` | Minimal service health; no proof of database/provider readiness |
| `POST /chatkit` | HMAC/timestamp verification; envelope validation; client membership/enablement; leases, quotas and scoped ChatKit operations |
| `POST /chatkit/upload` | Signed server-to-server request; scoped upload/type/size/attempt handling |
| `POST /builder-preview` | Signed Admin preview envelope, Admin/config revision/preview limits; separate preview ownership |

ChatKit operations allow create/add/retry, list/get threads/items, update/delete
threads and attachment deletion. Browser model/tool overrides and non-text prompt
parts are constrained. `PostgresStore` repeats client/user/thread/mode ownership.

The client agent can receive server-scoped read-only Hubstaff snapshots/index
search, approved public-domain web search, cached approved source excerpts, client
library/file search, and published file/image tools. General chat and preview have
different capabilities; role/mode differences must remain in server code.
Optional semantic Decisions routing is not an authorization decision. Accounting
records one logical action and can track multiple physical provider calls.

## 10. Jobs, audit, cost and credit-report reuse

| Existing feature | Reuse and current limit |
| --- | --- |
| Make test | `lib/make-webhook.js` verifies an HTTPS Make host and requires explicit scenario confirmation. It is a connectivity test, not a general workflow engine/inbound business-event processor. |
| Hubstaff dashboard/assistant | Approved per-client project/time mapping, list/task verification, redaction, date/history paging, current board and indexed lexical search already exist. |
| Hubstaff queue work | Local schema adds durable jobs/leases/checkpoints, retry policy, shared credential throttle and five slots. Local CLI still calls `processNext` serially; cron calls `processBatch`. Do not claim completed five-lane local concurrency or deployed migration readiness. Database integration suite was skipped. |
| Source preparation | Admin Google consent, read-only discovery/preview, encrypted prepared cache, revision/access checks, approved audiences and scheduled/local synchronization are existing paths. Chat retrieval uses cached DB data rather than scanning Drive per prompt. |
| Source cron/local worker | `scripts/sync-prepared-sources.mjs`, `/api/cron/source-sync`; `npm run dev` opts into the source worker through its flag. No scheduler was started/verified. |
| Internal cache | Six on-demand feeds: personal work, roster, derived team status, HR, PM catalog, PM tasks. Configurable freshness is not a background scheduling SLA. Role checks precede cache reuse. |
| Integration audit | `portal_integration_runs`, `lib/integration-run-audit.js`; source/operation/status/timing/count/error metadata, not raw credentials/messages. |
| Client/Admin audit | Allowlisted actions in `portal_audit_events`, AI actions in `portal_ai_usage_events`, client access audit and separate Internal access/panel/sync audits. |
| Usage | Current client-wide monthly request allowance, tool/preview attempt limits and safe usage summaries. Reset semantics differ from reviewed-master reporting controls. |
| Cost ledger | `portal_ai_cost_events`: reported/estimated/unknown basis, decimal USD and pricing snapshot, idempotent event keys; Admin month/CSV reports distinguish incomplete coverage. Not an invoice, wallet, provider balance or payment collection. |
| Credit reports at reviewed master | Reuse candidate only: append-only pricing, per-client/month snapshots and idempotent reporting entries; client balance/history/pricing and Admin allowance management. No live payment, invoice or prepaid enforcement is established by those reports. |

The README includes older statements such as automatic knowledge synchronization
being unimplemented, while current source jobs already exist. Preserve the README
for this stage; use code plus the more specific setup/source/job documents rather
than treating every historical summary as current implementation evidence.

## 11. Private configuration inventory

The root `.env.example` defines 40 names. Presence was checked privately in this
checkout only; no values were printed or copied, and no placeholders were added.
Presence/length is not proof of provider authorization or a working deployment.

### Present core configuration, still requiring target/runtime verification

`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
`CHATKIT_BACKEND_URL`, `CHATKIT_BACKEND_SECRET`, `PROVIDER_SETTINGS_SECRET`,
`NEXT_PUBLIC_CHATKIT_DOMAIN_KEY`, and `OPENAI_API_KEY` are present. Checked core
auth/backend/provider/Hubstaff encryption settings meet their 32-character length
requirements. Saved provider rows and actual model authorization were not queried.

Hubstaff access/PAT, token encryption, reporting timezone, internal team/schedule
settings, OAuth client/secret/redirect names are present. Make webhook and Google
Drive client ID/allowed-email names are present. These integrations were not called.

### Missing names and where to configure them privately

| Missing name(s) | Runtime / impact | Private configuration location |
| --- | --- | --- |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Next.js/source worker; Drive setup incomplete | Retrieve the intended OAuth client's secret in Google Cloud; enter it privately in this checkout's `.env.local` and the matching Vercel Next.js environment |
| `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` | Next.js/source worker; saved grants/cache need the original stable key | Restore from the owner's existing secret store/Vercel setting; do not generate a replacement over encrypted data |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Next.js/source worker; approved source boundary missing | Privately configure the approved folder ID, not its full URL, in `.env.local`/Vercel |
| `SOURCE_SYNC_SECRET` | Protected source cron cannot authenticate | Set a server-only bearer secret privately in Next.js/Vercel and the approved scheduler |
| `HUBSTAFF_INDEX_SYNC_SECRET` | Protected Hubstaff cron cannot authenticate | Set a server-only bearer secret privately in Next.js/Vercel and the approved scheduler |
| `LOCAL_SOURCE_SYNC` | Optional local source-worker switch; default off | Set privately in `.env.local` only after a safe job/database target is selected |
| `LOCAL_HUBSTAFF_INDEX_SYNC` | Optional existing-index upkeep switch; default off | Set privately in `.env.local` after target review; explicit queued jobs still run when dev starts |
| `CHATKIT_VERCEL_PROTECTION_BYPASS` | Optional Next.js-to-protected-remote-Python deployment token | Configure privately in the Next.js Vercel project only if that backend deployment needs it; local backend does not |
| `DATABASE_POOL_MAX` | Optional Node pool size; defaults to 3, capped at 10 | `.env.local`/Vercel Next.js; tune only for the intended database connection budget |
| `CHATKIT_UPLOADS_ENABLED` | Optional Node/Python feature switch; effective default true | Match private runtime settings across services if overriding; required tables remain unverified |
| `OPENAI_DECISIONS_ROUTING` | Optional Python routing switch; effective default true | `.env.local` locally or Python Vercel environment if overriding |
| `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | Optional provider headers with existing fallbacks | Private application environment if using OpenRouter-specific attribution |
| `DEBUGGER_DEVELOPERS`, `DEBUGGER_MAX_RECORDS`, `DEBUGGER_CAPTURE_BODIES`, `DEBUGGER_BODY_PATHS` | Optional diagnostics controls; effective `DEBUGGER` is false | Private local/approved environment only; do not enable body capture during this audit |

`CRON_SECRET`, accepted by code as an alternative to the two cron secrets, is also
absent. `OPENROUTER_API_KEY` is absent as an environment fallback; DB-managed
provider settings can supply credentials, so this alone is not a blocker. Neither
name was newly added to the template.

For deployment, configure the intended `DATABASE_URL`, matching
`CHATKIT_BACKEND_SECRET` and stable `PROVIDER_SETTINGS_SECRET` on both services.
Authentication settings belong to Next.js; image/model backend settings belong
to the runtime using them. The local launcher inherits root `.env.local`; it does
not require copying it into `chatkit_backend`. Provider keys can be managed through
the existing AOC Admin settings, without exposing them in these records.

No disposable/staging database URL is configured/approved for test writes. Do not
paste URLs or secrets into chat, source control, these Markdown files, or logs.

## 12. Gaps and unverified conditions

1. Resolve which baseline will be used for later implementation: preserve and
   selectively reconcile current local changes, or explicitly authorize another
   checkout/worktree. Stage 01 did not make that integration decision.
2. Provide a disposable/approved staging database before SQL tests, migrations,
   provisioning, account/role mutations, cache jobs or reporting reconciliation.
3. Restore the three missing Drive settings before a named live source check.
   Google sign-in/consent must be performed by the authorized account owner when
   required; a stored connection record is not proof of a valid grant.
4. Configure approved cron secrets/scheduling before claiming background freshness
   or testing queued jobs against a remote database.
5. Review local parallel-index work as incomplete integration; do not install its
   migrations or finish its implementation during this baseline stage.
6. Credit, readiness and Website Insights suites/features at `916bbf5` are not
   available in this checkout. No live payments or commercial billing readiness
   can be inferred from cost/credit reporting code.
7. Current synthetic Python tests emit pre-existing accounting mock warnings;
   passing mocks do not establish real SQL ledger correctness.
8. Database schema state, live provider/model/key access, OAuth validity, Make
   execution, provider costs, deployments, real-user allow/deny behavior and
   commercial configuration were not verified. No provider sign-in is needed for
   Stage 01; ask only for the specific later live check the owner authorizes.

## 13. Stage 02A product boundary and baseline recommendation

[DECISIONS S02A-D01–D04](DECISIONS.md#s02a-d01--product-ownership-branding-and-customer-rights-are-separate)
defines three draft offers: platform only, specialist only and combined. AOC's
proposed software ownership, Whitecap's current people-services presentation,
the proposed Agency Enabled platform brand and customer data rights are separate
subjects. Nothing is publicly branded, priced or contracted by this stage.

Software entitlement, a staffing assignment and customer-data access are three
independent contracts. A platform-only agency needs no staffing engagement. A
staffing-only customer may use existing tools without a portal account; only
minimum approved delivery/onboarding context is needed. HR, payroll, recruitment
and automatic personnel-record sharing are outside this release. Internal Portal
features and existing client isolation are preserved without code changes.

The current branch remains `master` at `786b3b5`. Re-reading the other local
repository confirmed the reference HEAD is `916bbf5`, with two subsequent commits
(`f3bdb19`, `916bbf5`) and 198 committed paths changed relative to current HEAD.
This does not replace Stage 01's separate comparison against the dirty worktree.

Recommended later implementation branch: **`feat/agency-platform-isolation` from
`916bbf5b781ea0dd7b3b685d5517694dad4185a7`**, subject to repository-owner
confirmation that reviewed master is the intended build baseline. Use an isolated
checkout/worktree later, selectively reconcile local fixes, and re-establish a
private safe environment. No branch, worktree, source merge or environment copy
was made here. See [S02A-D07–D08](DECISIONS.md#s02a-d07--preserve-reviewed-baseline-credit-and-usage-semantics).

Include reviewed-master AI Credits, Website Insights and usage history/reset in
that later isolation design. They are not present in this checkout and were not
ported or certified by the Stage 01 build. Credit reports remain reporting-only;
reviewed-master disabled monthly request caps must not accidentally be restored
as a software licensing rule. Global Admin reports/resets and shared settings
need agency-aware authorization, not just a new sidebar or plan label.

## 14. Permission walkthrough: two fictional agencies

**Design examples only: no accounts, clients, grants, records or tests were
created. The proposed agency and support boundaries are not implemented yet.**
Identifiers below are explanatory labels, not real customer IDs or schema design.

| Fictional organization | Offer and actors | Explicit customer-data scope |
| --- | --- | --- |
| Agency A: Harbor Agency | Platform only. Mira is active agency staff; Ada is the agency administrator with delegated client-data authority. No specialist purchase is required. | Mira is assigned Orchid Shop (`A1`) with overview, document-read and AI permissions. Birch Shop (`A2`) is another A client with no Mira grant. |
| Agency B: Summit Agency | Combined. Ben is authorized B staff. Noah is a Whitecap specialist whose engagement is separate from software access. | Ben is assigned Pine Shop (`B1`). Noah receives no portal/client access solely from the staffing assignment; an authorized invitation and B1 action grants are required if portal work is later agreed. |

Summit is also a valid **specialist-only** customer if it buys no software: its
people engagement can run in its existing tools, with no Ben/Noah portal account
or portal import required. The combined example above assumes software and
invitations were explicitly approved; it is not an automatic conversion rule.

| Attempt | Proposed result | Why / where the boundary must hold |
| --- | --- | --- |
| Mira opens A1 in Agency A | Allow the granted actions | Active identity and A membership, active platform/module entitlement, explicit A1 grant and action permission all agree on the same agency/client. |
| Mira opens A2 | Deny | Ordinary A membership alone does not grant every A client. A1 access cannot widen to A2. |
| Mira opens B1 using a URL, changed client header/cookie, guessed ID, file link or AI prompt | Deny before returning data | The server must require B membership and the B1 grant, neither of which Mira has. Browser values select a candidate; they do not create authority. |
| Ben opens B1 / A1 | Allow B1 granted actions; deny A1 | B's platform contract and Ben's B1 permission never establish an A membership or A1 grant. |
| Noah opens B1 based only on his specialist assignment | Deny portal access | Staffing is not software entitlement, a login or customer-data permission. An existing-tools engagement remains valid. |
| Mira sees credits or Website Insights | Only enabled modules and permitted A1 views/actions | A1 overview/report eligibility does not grant global pricing administration, usage reset, other-client reports or Google property access. Apply the approved module-specific action policy. |
| An AOC support engineer opens A1 without a grant | Deny under the proposed support model | AOC ownership/global operations role is not customer authorization; current global Admin behavior still needs future changes. |

The later enforcement must cover page loaders, all Next.js/Python endpoints,
thread ownership, uploads/library/downloads, AI tools/source retrieval, provider
property bindings, caches, indexes, background jobs, reports and CSV exports.
Queries and cache keys must bind the effective agency/client/action; switching
accounts, replaying a link or resuming a thread cannot reuse another context.
Never rely on a model obeying an instruction to protect data already retrieved.
Preserve client-specific ownership, action and source checks inside each agency.

### Shared AI knowledge in this example

| Knowledge item | Mira / A1 chat | Ben / B1 chat | AOC support with only an approved A1 diagnostics grant |
| --- | --- | --- | --- |
| Approved sanitized AOC platform manual, published as common guidance | Yes, if AI/common guidance is entitled and permitted | Yes, under the same rule | May use ordinary approved product guidance; not a customer-data bypass |
| Harbor's private agency playbook | Only if Mira's source audience permits it | No | No, unless the grant separately names the needed playbook resource |
| A1's approved delivery/review guide | Yes, within Mira's A1/source permissions | No | Only the excerpts/resources explicitly covered by the support grant |
| A2 private guide | No | No | No |
| Summit playbook / B1 project documents | No | Only the B sources Ben is permitted to use | No |
| Private AOC Admin packs or Whitecap personnel files | No | No | No implied access; personnel records remain outside this release |

A shared AI provider/key is only execution infrastructure; it does not combine
audiences. A Work questions answer about A1 review tasks must use approved A1
Hubstaff mappings/sources, not B data or an unverified prompt claim. Shared manual
text cannot override membership, freshness, permissions or source bindings.

Current `portal_source_publications.audience='clients'` is globally applicable,
not an agency audience. Existing shared packs require owner classification and
explicit approval before they could be retained as sanitized platform-common
knowledge in a multi-agency product. This stage neither certifies their contents
nor changes the existing publication/query behavior.

### Approved AOC support access example

A fictional AOC engineer, Sam, requests read-only A1 diagnostics for ticket
`SUPPORT-A1-EXAMPLE`, naming specific resources, purpose and a finite expiry.
Ada approves only if her delegated authority covers those A1 resources; otherwise
the end-client data owner must also approve. Sam cannot self-approve. The platform
must durably record approval/activation before enabling the grant, retain Sam's
real actor identity, and check the grant on each request/tool/cache access.

Audit records would show request, approver/decision, activation, each access
outcome and expiry/revocation, linked by grant/ticket ID and agency/client scope.
They contain metadata, not secret values, source bodies or personnel files. Ada's
authorized audit view can review the scoped support history. A1 read access does
not authorize A2/B1, private agency playbooks, finance mutations, exports or paid
provider tests. Expiry/revocation stops use and invalidates cached authorization.

This approval workflow is **proposed**, not an existing AOC Admin capability.
Current global Admin resolvers/audit helpers are reuse candidates, but need new
scoped grant enforcement and audit lifecycle support in a later code stage. No
emergency override or support grant was created/tested. See [S02A-D06](DECISIONS.md#s02a-d06--aoc-support-approval-and-audit).

## 15. Additional setup if the reviewed baseline is adopted

Stage 02A rechecked private configuration presence without connecting to any
database/provider. The current database is still remote Neon with no approved
test/staging designation. Section 11's missing settings and private setup actions
carry forward; no secret values, env changes or new variable placeholders were added.

The reviewed `.env.example` additionally names the following settings, all absent
from this checkout's private environment. They are existing reviewed-feature
settings, not variables introduced by this documentation stage.

| Reference-only missing name(s) | Runtime / private setup when needed |
| --- | --- |
| `WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID`, `WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET` | Optional separate Search Console OAuth app settings on Next.js `.env.local`/the matching Vercel web project. Reviewed code can fall back to existing Drive OAuth app settings; the underlying Google consent/token is separate from Drive. |
| `WEBSITE_INSIGHTS_ENCRYPTION_KEY` | Stable server-only Next.js key for this feature, or reviewed code's Drive-key fallback. Restore the original applicable key if ciphertext exists; do not replace it casually. |
| `PAGESPEED_INSIGHTS_API_KEY` | Optional server-only Next.js key from the approved Google project for PageSpeed quota. HTML analysis does not require it; no Google/AI request is made here. |

Do not copy the other checkout's secrets. Configure only after selecting the
implementation/staging target and the integration owner. For a later named live
Search Console check, the authorized customer/agency account holder must perform
its separate consent and property selection; no sign-in is needed for this stage.
AI Credits/usage reports add no payment credential requirement in this design.

## 16. Deferred checks and next-stage boundary

The two Stage 01 skipped SQL integrations (Hubstaff queue and Python Hubstaff
search) remain skipped. No `setup:check`, migration, ledger/credit/reset SQL check,
Website Insights SQL fixture or live support/agency authorization test was run in
Stage 02A. Even TEMP/rollback fixtures need a disposable/approved staging database.
Reference-only test commands must be taken from the selected baseline after it
is established; their historical documentation is not evidence of a current pass.

The tables above are manual design cases, not mocked software tests or real
multi-agency security certification. Future staging tests must demonstrate A1
allow, A2/B1 deny, staffing-without-login, filtered AI source retrieval, revoked
support grants, cache/context switching and scoped reports/jobs/exports.

Product drafting is complete without a blocking leadership decision. Public
brand, prices, module inclusions, support/service obligations and legal terms
remain unapproved. Stop after Stage 02/02A; agency isolation is a later explicitly
authorized implementation stage, conditional on the baseline and safe-target gates.

## 17. Stage 03 confirmed target and prepared foundation

The owner confirmed `feat/agency-platform-isolation` from the full reviewed commit
`916bbf5b781ea0dd7b3b685d5517694dad4185a7` and selected **no approved database;
prepare migration only**. Implementation is in the isolated worktree
`C:\Users\MY PC\Desktop\AOC\chatkit\.tmp\agency-platform-isolation`. Original
dirty `master` remains at `786b3b5`. The pinned commit was imported locally;
no remote network fetch, application merge or environment copy was used.

Stage 02 (permission/data ownership design) and Stage 02A (three product offers)
are both present as draft deliverables, not implemented permissions or approved
commercial terms. The former combined progress row was split to reflect them.
There was no missing product-design deliverable blocking schema preparation once
the owner confirmed the baseline. Brand/rate/service approvals remain separate.

Reuse includes the existing portable SQL/connection paths and legacy client/user/
membership identifiers. Reviewed AI Credits, Website Insights, Google grants,
usage-reset evidence and global provider/source ownership are included in the
new classification inventory. No reviewed feature was removed, reimplemented,
enabled as a package or ported from local fixes.

Prepared changes are limited to the new `agency_platform` namespace, privileged
role-setup SQL, version/checksum migration runner, restricted scope helper,
Next wrapper with no route imports, two-fictional-agency acceptance fixture, local
safety tests, empty test/migration configuration placeholders and documentation.
See [Stage 03 database design and setup](STAGE03_DATABASE.md) and
[S03 decisions](DECISIONS.md#s03-d01--confirmed-baseline-and-preparation-only-database-scope).

The ownership overlay preserves existing tables and does not auto-assign legacy
clients. Composite keys reject a client linked to a foreign agency or an access
grant for a user lacking the matching agency membership. Explicit resource
classifications cover private/common source packs, credentials, audits, generated
assets, billing references, Google data, indexes/jobs and Internal-only records.
Unreviewed/missing ownership does not become a global grant.

RLS/grants are prepared for the **new schema**, with a protected per-agency DB
login binding and parameterized transaction-local context. The trusted owner
exception and broad service credentials are explicitly outside the protection
claim. The current shared connection credentials, PostgreSQL role metadata and
legacy table policies were not inspected live or changed. No current portal mode
can be called agency-isolated from these offline preparations.

New local tests passed with mocked connections/synthetic URLs; focused lint
passed. No migration, foreign-agency SQL, PostgreSQL role/policy, real connection
reuse, provider or deployment check ran. The real fixture defaults to SKIPPED
without its own `AGENCY_TEST_DATABASE_URL`. `AGENCY_MIGRATION_DATABASE_URL` is the
separate private migration target; both are unconfigured. No `.env.local` was
copied into this worktree, and no dev worker was started.

Stage 03 remains prepared with database acceptance pending. No new page/route/
worker/Python integration imports the new helper; agency routes stay deferred
until Stage 11. Stop here rather than continuing to another implementation stage.

## 18. Stage 03 approved local verification — complete

The owner subsequently approved creating a new disposable local PostgreSQL
database and privately configuring the two test/migration targets. Docker was
unavailable; Ubuntu WSL hosted rootlessly extracted official Ubuntu PostgreSQL
18.3 binaries in private persistent task storage. No system service/package
installation or production connection was used. Exact loopback server identity
was verified before writes.

Both private URL names are configured only in the worktree's ignored
`.env.agency-test`. Its ACL permits the Windows owner, sandbox account and SYSTEM;
no values appear in source/docs/output. Original `.env.local` remains unchanged.
Two new local databases separated the acceptance fixture from CLI migration
application. The fixture ran first because its group-role names are cluster-wide.

Actual results: **9 real PostgreSQL scenario groups passed**, including composite
ownership/member rejection, explicit private/common scope, ordinary foreign
read/write denial, role restrictions, revocation and owner exception. Real pool
checks asserted the same backend PID after commit/rollback with cleared context;
intentional session pollution forced replacement with a new clean backend.
Standalone migration CLI apply and identical rerun passed. Inspection confirmed
one checksum version, eight FORCE-RLS tables and unchanged empty prerequisite
client/user/membership tables. Fixture cleanup was independently verified.

The first run found cleanup error 2BP01 from the owner's public-schema USAGE
grant. The fixture now revokes that task-created grant before dropping roles.
The corrected/strengthened run passed; no migration or authorization policy was
weakened. Nine offline tests and focused lint also passed after the change.

The task-specific server was stopped and its foreground process exited 0. Local
data/binaries and ignored configuration are retained for inspection. Actual Neon
roles, external transaction poolers, legacy application integration and production
deployment remain unverified; the original SQL-test skips outside Stage 03 are
separate. No agency route is exposed and no Stage 04 work began. See
[current verification progress](PROGRESS.md#stage-03-local-verification--completed-after-explicit-owner-approval)
and [database setup/results](STAGE03_DATABASE.md).

## 19. Stage 04 — local legacy AOC adoption and restore rehearsal

The owner approved restarting the same rootless WSL PostgreSQL server and using
two fresh disposable databases for synthetic legacy migration and backup restore.
Loopback target identity was verified before writes. Branch/base remain
`feat/agency-platform-isolation` from `916bbf5`; original local edits and Neon
remain untouched. The additive version-002 overlay adopts explicitly reviewed
AOC clients/dependencies, retains fictional Harbor ownership, scopes company
guidance to AOC and holds ambiguous records outside tenant retrieval. Credentials,
platform settings and pricing stay explicitly private. Customer agency membership
is `client_user`, not staff/admin. Version 001 and Internal/Python code are unchanged.

Actual inventory: 46 relations/51 legacy records; 27 client + 1 AOC agency +
16 private + 7 quarantined, zero conflicts. Two READ ONLY dry runs changed no
table, sequence or custom trigger. First apply added 51 ownership rows; second
changed none. Full states after both applications matched. All legacy tables
and sequences matched before/after adoption. A custom-format backup restored to
the separate empty target with all table rows, history and logical sequence
values preserved. Internal WAL sequence counters are distinguished from logical
state in the [runbook](STAGE04_REHEARSAL.md).

Eight real SQL groups passed: ownership/conflict/role checks, foreign/private/
quarantine denial, write exclusion, pooled reuse, existing client DAL flows,
post-cutover writes, membership revocation and publisher deactivation. Sign-in
and the Internal guard were mocked; repository SQL was real. Twenty-nine offline
tests and focused lint passed. Browser, Python/providers, external poolers and
production remain unverified. Full build is blocked by worktree dependency
layout; the webpack alternative reports missing installed `cheerio`,
`robots-parser` and `ipaddr.js`, already declared in reviewed package.json.

No Stage 04 test configuration is missing. The new dedicated
`AGENCY_BACKFILL_DATABASE_URL` is private in ignored `.env.agency-test`; a generated
non-owner legacy application URL is in ignored `.env.agency-stage04-flows`.
No production environment was copied. The local server is stopped at closeout,
retaining disposable data/backup/config for review. See [progress](PROGRESS.md)
and [private setup/cutover boundaries](STAGE04_REHEARSAL.md). A real migration
needs its own approved snapshot, ownership review, window and final approval.
Earlier unrelated SQL skips remain unclaimed. No new routes/mode were enabled;
the Stage 11 gate remains intact. Stop before Stage 05.
