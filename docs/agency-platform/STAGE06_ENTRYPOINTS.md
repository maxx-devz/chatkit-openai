# Stage 06 server entry-point review

Baseline commit is `680af5b` on `feat/agency-platform` in the primary `AI\portal` checkout. This inventory covers the existing routes and their server-side authorization paths. Test results and deployment limits are in [PROGRESS](PROGRESS.md#stage-06-server-entry-point-ownership).

The Stage 05 trusted context intersects the live Better Auth session, active agency, client ownership, agency membership, legacy membership and client assignment. A request hint selects among those grants. Platform operator authority, Internal account authority and the finite support grant remain separate. Public agency routes return 404 until Stage 11. Legacy AOC Admin routes require the all-AOC estate.

## Next.js route handlers

| Path | Methods | Authorization and resource scope |
| --- | --- | --- |
| `api/admin/ai-spending` | GET | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/ai-usage/history` | POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/ai-usage` | GET | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/assistant` | GET, PUT, POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/audit` | GET | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/client-operations` | GET | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/clients` | GET, POST, PATCH | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/credits` | GET, POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/hubstaff-index` | GET, POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/make/test` | POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/presence` | GET | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/provider-settings` | GET, POST, PUT | Active platform operator; server-managed provider and model allowlists; global configuration. |
| `api/admin/source-connections/callback` | GET | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/source-connections/prepared` | GET, POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/source-connections` | GET, POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/source-connections/test` | GET, POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/admin/usage` | POST | AOC Admin DAL or resolveAdminContext; active operator and all-AOC estate required; explicit fields and selected client predicates. |
| `api/ai-access` | GET | Client AI permission; public configuration/appearance is read only for the trusted client. |
| `api/assistant-files/[id]` | GET | Client AI permission plus exact client/user/file/preview predicates. Preview branch uses restricted AOC Admin context and exact owner. |
| `api/auth/[...all]` | GET, POST | Better Auth session/origin/CSRF handling and rate limits. Public account creation is disabled. |
| `api/builder/preview` | POST | Restricted AOC Admin context before client selection or mutation. Preview signs the verified session and resource; Python rechecks the same platform restriction. |
| `api/builder` | GET, POST | Restricted AOC Admin context before client selection or mutation. Preview signs the verified session and resource; Python rechecks the same platform restriction. |
| `api/chatkit` | POST | Client AI permission, same-origin writes and stale-document client check. Signed session/agency/client/user envelope; Python rechecks current access; threads/items/uploads are client and user scoped. |
| `api/chatkit/upload` | POST | Client AI permission, same-origin writes and stale-document client check. Signed session/agency/client/user envelope; Python rechecks current access; threads/items/uploads are client and user scoped. |
| `api/client/audit` | GET | Client access-audit permission; client predicates in both event/usage branches before pagination. |
| `api/client/members` | GET, POST, PATCH | Client Administrator manage/audit permissions; exact client/member predicates; actor checked again in transaction; Viewer/Member creation only; protected administrators cannot be changed. |
| `api/client/password` | POST | Trusted client context and Better Auth current-password flow for the signed-in identity. |
| `api/client/website-insights/google/callback` | GET | Client read/contribute/manage permissions by action. Site/report/client joins protect counts, progress, history, JSON/CSV and OAuth session/state. Server owns client and creator fields. |
| `api/client/website-insights/google` | POST | Client read/contribute/manage permissions by action. Site/report/client joins protect counts, progress, history, JSON/CSV and OAuth session/state. Server owns client and creator fields. |
| `api/client/website-insights` | GET, POST | Client read/contribute/manage permissions by action. Site/report/client joins protect counts, progress, history, JSON/CSV and OAuth session/state. Server owns client and creator fields. |
| `api/client-library/[id]` | GET | Viewer read; Member own contributions/removal; Client Administrator manage. Exact client predicates for list, deletion and binary download. Ownership/billing overrides rejected. |
| `api/client-library` | GET, POST, DELETE | Viewer read; Member own contributions/removal; Client Administrator manage. Exact client predicates for list, deletion and binary download. Ownership/billing overrides rejected. |
| `api/conversations` | GET, PATCH, DELETE | Client AI permission; thread ID plus verified client/user predicates for list, rename and delete. |
| `api/credits` | GET | Client overview permission and stale-document client check; reporting period, entries and totals use the trusted client ID. |
| `api/cron/hubstaff-index` | GET | Constant-time server bearer check. Source worker is platform-private and binds publisher; Hubstaff worker selects adopted AOC ownership before batching and rechecks the project mapping for each write. |
| `api/cron/source-sync` | GET | Constant-time server bearer check. Source worker is platform-private and binds publisher; Hubstaff worker selects adopted AOC ownership before batching and rechecks the project mapping for each write. |
| `api/debugger/backend` | POST | Developer feature gate and session-bound debugger access; retired backend/events collectors return 404. Asset names use the existing allowlist. |
| `api/debugger/events` | GET, POST | Developer feature gate and session-bound debugger access; retired backend/events collectors return 404. Asset names use the existing allowlist. |
| `api/debugger/session` | GET | Developer feature gate and session-bound debugger access; retired backend/events collectors return 404. Asset names use the existing allowlist. |
| `api/hubstaff` | GET | Trusted client context; assigned project URL comes from server settings; list/task selection stays inside that project; workspace-isolated caches. |
| `api/hubstaff/tasks` | GET | Trusted client context; assigned project URL comes from server settings; list/task selection stays inside that project; workspace-isolated caches. |
| `api/hubstaff/workflow` | GET | Trusted client context; assigned project URL comes from server settings; list/task selection stays inside that project; workspace-isolated caches. |
| `api/internal/audit` | GET | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/connection` | POST | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/connection/unlink` | POST | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/dashboard` | GET | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/hr` | GET | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/hubstaff/oauth/callback` | GET | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/hubstaff/oauth/start` | POST | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/hubstaff-members` | GET | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/integration-settings` | GET, POST | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/internal-users` | GET, POST, PATCH, PUT | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/password` | POST, PUT | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/project-management` | GET | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/internal/sync-settings` | GET, PUT | Independent active Internal identity, action permissions and panel policy. Identity, OAuth and credential scopes bind to the Internal user. |
| `api/presence` | POST | Trusted client context; update only selected client and signed-in user. |
| `api/session/client` | PUT | Fresh Better Auth session and all current assignments; same-origin choice; HttpOnly selectors verified on every subsequent request. |
| `api/workspace` | GET | Client AI permission; snapshot, knowledge counts and usage use trusted client/user. |
| `debugger-lab/[asset]` | GET | Developer feature gate and session-bound debugger access; retired backend/events collectors return 404. Asset names use the existing allowlist. |

This checkout contains 59 route-handler files. There are no `use server` actions. All business routes also pass the canonical-host proxy and private, no-store response policy.

## Pages, search, files and jobs

| Surface | Boundary |
| --- | --- |
| Client root and credits pages | Resolve current client permissions before rendering. Multi-membership users explicitly choose a workspace. Browser DTOs omit the Better Auth session and server AI configuration. A workspace switch remounts the document and server cache keys. |
| Admin pages, layouts and Builder page | Restricted AOC Admin DAL before dashboard, selected client, builder and reports. Platform provider settings have their separate active-operator guard. |
| Internal pages and layouts | Active Internal identity plus action and panel checks on each DAL/API entry. Customer and agency staff records alone do not confer Internal authority. AOC HR, Internal personnel and organization-wide Internal PM remain private AOC operations. |
| Login and debugger pages | Login uses Better Auth. Debugger pages, assets and session config require its deployment feature gate and session check. The trace collector cannot store or replay another user’s events. |
| Header search and suggestions | Existing portal navigation search is local UI data. Task/comment/library searches use the server-established client/project scope. No cross-agency suggestion endpoint exists. |
| Conversations and attachments | Next.js list and mutation predicates include client and user. Python PostgresStore checks scope in thread/item pagination, cursor subqueries, insert/update/delete and attachment association. A foreign cursor is resolved only in the same scope. |
| Downloads and exports | Library bytes require client document read. Generated bytes require client/user and preview mode. Website JSON/CSV requires the report/site/client join. Filenames and output DTOs are bounded and stripped to the existing allowlists. |
| Prepared AI guidance | Metadata is revalidated for active publisher, owner, current source binding and freshness. Stage 04 publication predicate gives AOC guidance only to adopted AOC clients. A private Admin pack resolves by its owner. Decrypted cache keys include workspace and client. |
| Hubstaff | Server uses the saved project mapping. List IDs are checked against that project before task reads. SQL search/tasks/comments/counts use the same client and index binding. The service worker excludes foreign and quarantined clients and rechecks mapping under its lease. |
| Source sync, Make and provisioning | Source cron has a server-only bearer credential and syncs active platform publishers. Make’s live test requires restricted Admin access before any run/message. Standalone provisioning and migration commands require private operator credentials and explicit targets; they confer no browser privilege. No live job/provider call was used in this review’s tests. |

## Python service

| Endpoint | Boundary |
| --- | --- |
| GET /health | Public static service status, with no tenant data. |
| POST /chatkit | Bounded body, timed HMAC signature, strict envelope/payload allowlists, live Better Auth session lookup, Internal exclusion, complete agency setup, active ownership/assignment and AI role check. Existing non-AOC client traffic stays gated. Store and tool queries bind client/user/project. |
| POST /chatkit/upload | Same signed session and workspace check before storing bytes. File names, decoded content, attachment IDs and size follow the existing upload policy. |
| POST /builder-preview | Signed active session, active platform operator, Internal exclusion and the same all-AOC estate restriction before draft, quota, provider or artifact writes. |

## Mutation and deployment rules

Client mutations reject explicit agency, client, owner, user, permission, billing and price-override fields. Client roles are separately validated against Viewer and Member where creation is allowed. Existing server serializers and selected-column updates continue to allow only their feature’s fields. Site rename retains the stored URL and client. Library deletion checks the stored submitter. Role changes check both actor and target in the same client and transaction. Browser role flags never create platform authority.

Migration 004 adds one restricted function for a newly inserted AOC client. It verifies the active operator, active AOC adoption, transaction-time creation and ownership of every other client. Creation, ownership, administrator membership and audit now commit together. An old ambiguous client or a foreign estate is rejected. Existing Stage 04 triggers maintain memberships and dependent ownership records. Migrations 001–003 are preserved.

The legacy application login retains direct privileges on legacy tables. The signed application derives the actor from the authenticated session before calling the database functions. This stage does not claim that legacy data has database RLS coverage against a compromised application credential. The scoped agency tables retain the separately tested Stage 03 role-bound policies.

The Python and Next.js services must be deployed with matching signed-envelope support. Apply migration 004 with the reviewed owner and grant its single function to the designated runtime login. Production, provider network, payment, real-message and custom-domain checks remain pending. Agency B’s own client portal stays unavailable until the rollout gate. This review verifies denial across those gated routes and positive existing AOC behavior.
