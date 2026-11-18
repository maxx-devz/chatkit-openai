# Agency Platform decisions

> Primary project handoff: use `C:\Users\MY PC\Desktop\AI\portal`. The results below were recorded in the AOC source worktree. Stage 03–04 code has not yet been imported into this primary checkout. See [HANDOFF](HANDOFF.md) for exact Git files, local-only verification limits and the Stage 05 stop gate.

Recorded November 18, 2026. S01 decisions below retain the historical baseline
constraints. **Stage 02A adds draft product, commercial and permission rules only.**
These are internal design proposals, not approved customer terms. Stage 03's
foundation and Stage 04 adoption have now been verified on approved disposable
local databases only. Stage 04 adds guarded legacy compatibility after activation;
no new agency interface is enabled. Published brand, pricing and obligations
remain unchanged. Stop before Stage 05.

See [context and inventory](CONTEXT.md) and [progress](PROGRESS.md).

## S01-D01 — Audit the current checkout; use reviewed master as a reference

**Decision:** The write target is `C:\Users\MY PC\Desktop\AOC\chatkit`, branch
`master`, HEAD `786b3b56468ffda6c1561c21894bb928e15e41d0`. Preserve its 37 modified
tracked paths and 27 pre-existing untracked status entries.

The reviewed object `916bbf5b781ea0dd7b3b685d5517694dad4185a7` was read from the
other local repository because it is absent from this checkout's object store.
No branch, worktree or remote was changed. Reference-only credits, usage controls,
readiness and Website Insights are recorded as reuse candidates, not installed
features here. The 102 differing shared files and local-only additions prevent a
safe wholesale copy.

**Pending owner decision:** Select the implementation checkout/reconciliation plan
before a later code stage. Do not automatically merge or discard either copy.

## S01-D02 — Documentation-only stage

**Decision:** Create only `docs/agency-platform/CONTEXT.md`, `DECISIONS.md`, and
`PROGRESS.md` as source-controlled work for this stage. Read existing instructions
and installed framework guides; do not edit framework/application code,
dependencies, environment templates, schemas or existing behavior.

Setup preview, compilation, synthetic tests and ignored local audit artifacts are
permitted verification. Do not commit, push, deploy, launch real-data workers or
continue to another stage automatically.

## S01-D03 — No remote database is presumed safe for test writes

**Decision:** The configured remote Neon URL is not treated as approved staging or
disposable. No database connection or write was made for this stage. Tests ran
without live database settings; compilation used an unreachable loopback URL and
synthetic secrets. Database opt-in suites were skipped.

Before later SQL tests/migrations, establish and privately identify a disposable
PostgreSQL instance or an owner-approved Neon staging branch. Review every script's
target variable; many consume `DATABASE_URL`, not a separate test setting. Even
rollback-only tests must not use production data under this stage's constraints.

Authenticated GETs can upsert identity, reconcile reports, refresh caches and
record audits. Do not use HTTP method alone to decide whether a check is read-only.

## S01-D04 — Preserve the three portal trust boundaries

**Decision:** Reuse Better Auth and the existing client membership, AOC Admin and
Internal role/panel/permission resolvers. They are distinct authority systems,
despite sharing account and database infrastructure.

- Client Administrator is scoped to one client and is not AOC Admin.
- Internal-only users, including paused ones, must not fall back into the other
  portal types.
- Internal HR, PM, organization status and personal work have different data scopes.
- Server-established membership/project/thread/user context remains authoritative;
  prompt text, browser IDs and URL prefixes do not grant access.
- Trace permissions through called helpers; legacy `Admin` helper names in
  `lib/admin-data.js` do not override Internal management guards.

No browser database connection, new role grant, relaxed origin check, disabled
freshness check or cross-client cache is introduced by this stage.

## S01-D05 — Shared settings are not already isolated agency settings

**Decision:** Record site-wide AI provider selection/secrets, signing/auth secrets,
Drive publication/root/grants, Hubstaff organization credentials, Make webhook,
cron bearers and staff audit/cost views as sensitive shared resources.

They cannot automatically become per-agency resources by adding a new UI or reusing
`client_id`. A future multi-agency schema and authorization decision must address
their ownership, encryption, scope, retention and migration. Stage 01 neither
designs nor implements that migration.

Preserve stable encryption secrets for existing ciphertext. Configure values
privately in the intended `.env.local`/Vercel services or existing admin settings;
never transfer them from another laptop or print them in audit records.

## S01-D06 — Keep PostgreSQL portability and current persistence subsystems

**Decision:** Continue the `AGENTS.md`/`DATABASE_PORTABILITY.md` rules: Next.js uses
`lib/database.js`, Node provisioning uses `lib/postgres.js`, and Python uses its
database helper. Standard PostgreSQL migrations remain versioned.

No Neon-specific SDK, Supabase SDK, extension, dashboard-only schema operation,
Supabase Auth or Storage migration is implied or approved. Better Auth and
database-backed file storage remain independent migration concerns.

## S01-D07 — Financial observations, reporting credits and payments are distinct

**Decision:** Existing USD cost records remain observations with reported,
estimated or unknown basis and saved pricing assumptions. Do not present unknown
cost as zero or usage estimates as provider invoices/remaining monetary credit.

At reviewed master, AI Credits are reporting-only monthly pricing/allowance
records. They are absent locally and do not establish live payment, invoice,
prepaid-wallet or commercial-billing capability. Reviewed-master request-cap/reset
semantics differ from this checkout's current monthly reservation.

Any reconciliation, quota-policy change, pricing activation or payment work needs
a later explicit stage and safe target. No payment provider or customer charge is
used in Stage 01 tests.

## S01-D08 — Prefer existing working paths; do not certify partial job work

**Decision:** Reuse the current signed ChatKit proxy, scoped Store, client access
loader, approved-source preparation/retrieval, Hubstaff board/history/index
readers, audit helpers, cost ledger, and existing authorization tests where the
later task matches them.

The local queue/slot/retry/throttle files are preserved as pre-existing work.
Current CLI serial processing and cron batch processing differ. No five-lane
local worker, database migration installation, scheduler freshness SLA or recovery
behavior is certified by a passing build or skipped SQL test.

Internal cache refresh intervals remain on-demand freshness policies, not an
automatic background scheduler. Source applications remain the source of truth.

## S01-D09 — No live consent/provider checks without a named operation

**Decision:** Do not call Make, send real messages, invoke paid AI, refresh live
Hubstaff/Drive data, reconnect accounts or request provider sign-in in Stage 01.

A later live check must name its provider, environment, account/scope, expected
side effects and required consent. If Google or Hubstaff requires interactive
authorization, ask the authorized user to complete that flow. A missing or revoked
grant cannot be repaired by weakening access checks or substituting another key.

## S01-D10 — Accurate acceptance and stop gate

**Decision:** Report local build/lint/synthetic results separately from skipped
database tests, existing mock warnings and unverified live/deployment behavior.
Do not promote historical test claims from older documents into current evidence.

Stage 01 closes after the inventory, comparison, configuration gaps and progress
record are written and existing files are checked for preservation. **No next
implementation stage is authorized automatically.** Its specification, target
checkout and disposable/approved staging database must be supplied/confirmed first.

## S02A-D01 — Product ownership, branding and customer rights are separate

**Status: proposed product boundary; contractual wording and branding unapproved.**

| Subject | Proposed rule | Approval still needed |
| --- | --- | --- |
| Software | AOC retains ownership of its pre-existing software, source code and platform IP; customers receive the software access/license agreed in their platform contract. | Final contracting entity and license terms before contracting/publication; this document does not determine legal title. |
| People services | Whitecap currently presents specialist/people services. Hiring a person does not convey platform ownership or require platform purchase. | Confirm the services contracting party, engagement terms and responsible delivery contacts; a display brand does not establish employer or legal status. |
| Platform brand | Agency Enabled is a proposed platform-facing brand only. Keep labels reversible and draft. | Leadership's brand/white-label decision before any public rollout; no assumed transfer of AOC ownership. |
| Agency/client branding | Customer branding can be an approved presentation option, not an access grant or source-code transfer. | Scope and permission to use each brand before publication. |
| Customer data | Customers retain rights in their supplied data. An agency must have authority to process its end-client data and approve delegated access. AOC receives only the agreed processing permission needed to operate/support the service. | Confirm contracting/data authority, retention/export/deletion terms and any separate provider-processing consent. No unrestricted cross-customer reuse or training permission is inferred. |
| Deliverables | Customer material, AOC platform IP, third-party assets and newly commissioned specialist work are distinct categories. | Ownership/license of commissioned outputs belongs in an approved statement of work (SOW); do not invent a blanket transfer or guarantee. |

Commercial purchase, personnel assignment, branding and possession of a provider
credential do not confer customer-data access. AOC software ownership is not a
standing permission to inspect customer conversations, documents or finances.

## S02A-D02 — Three independent offers

**Status: draft package rules, not a published catalog.** A valid customer can buy
software without staffing, or staffing without software. Combined is an explicit
selection of both scopes, not a new privileged role or an automatic discount.

| Offer | Draft included scope | Support and delivery responsibility | Fee categories |
| --- | --- | --- | --- |
| Platform only | Access to agreed platform modules and agency/client workspaces for authorized users, with existing authentication and permission boundaries. No specialist assignment or managed client delivery is implied. | AOC software team handles platform defects/configuration under approved support terms. The agency's named delivery lead sets client priorities and accepts work. | Software subscription; separately approved optional onboarding/integrations/services and disclosed usage charges, if contracted. No staffing fee. |
| Specialist only | A scoped specialist engagement and minimum onboarding/delivery context. The customer may retain its existing tools. No portal account, software subscription, AI allowance or new customer-data import is required just to hire a specialist. | The named Whitecap engagement contact coordinates the person, availability and people-service escalations under agreed terms. The customer's delivery lead manages priorities/acceptance unless managed delivery is explicitly contracted. AOC software support is not support for the customer's third-party tools. | Staffing/engagement fee under its own approved terms; optional services only if separately agreed. No implied software subscription. |
| Combined | Both independently approved scopes above, with an explicitly named contact to route software versus people/delivery issues. Module access and personnel assignments remain separately authorized. | AOC software team supports the platform; the Whitecap engagement contact supports the person; the named customer delivery lead manages delivery unless a separate managed-delivery SOW assigns that duty. | Distinct subscription, staffing and optional-service line items. Billing schedule/entity/one-versus-separate invoices remains an open commercial decision; no bundled price or discount is assumed. |

No rates, minimum hours, turnaround promises, replacement guarantees, support
hours, SLA, outcomes or discounts are set by this design. Optional managed
delivery, onboarding, migration and integration work require an approved scope
and fee; they are not silent package inclusions. Third-party tool/provider costs
must not be relabeled as a staffing price or an already-approved software price.

Software module candidates are the existing client workspace, documents,
membership/audit views, AI and approved knowledge, Hubstaff reporting, and the
reviewed-baseline Credits/Website Insights/usage capabilities. Their presence in
code is not a promise that every plan includes them. See S02A-D04 and D07.

Ending an engagement revokes its delivery/data grants; it does not automatically
cancel a platform subscription. Ending a subscription removes platform access
under approved terms; it does not automatically terminate a specialist engagement
using other tools. Neither event silently deletes customer data, retained audit
evidence or the other offer. Retention/export responsibilities need approved terms.

## S02A-D03 — Separate commercial, assignment and access contracts

**Status: proposed permission contract; no schema or enforcement added.**

| Contract | What it establishes | What it cannot establish |
| --- | --- | --- |
| Software entitlement | The purchasing agency, approved package/modules, status and agreed effective period. | A user's identity, membership, role or right to every client/source. |
| Staffing assignment | Who is engaged for which customer/agency and delivery scope, with start/end/status and a named delivery lead. It may exist without a portal user. | Subscription entitlement, automatic login, client membership, finance access or HR-record access. |
| Customer-data authorization | An authorized actor's agency/client/resource/action scope, purpose and applicable validity/revocation conditions. | Ownership of data/IP, purchase of software, or permission to unrelated clients. |

A normal platform request needs all applicable conditions: authenticated active
identity, active agency membership, platform/module entitlement, approved client
assignment/grant, action permission, and source/integration scope. The server must
derive and validate agency and client together. UI visibility, URL/client header,
cookie, prompt text, model output or a staffing assignment alone is insufficient.

Agency membership alone does not give ordinary agency staff every client. An
agency administrator's broader client-management rights, if approved later, must
be explicit and stay within that agency. Existing global AOC Admin is not a
ready-made agency administrator role. A person working for multiple agencies
would need independent grants and an explicit active context; switching context
must not carry another agency's cached data, sources or permissions.

Assignments may contain only delivery-relevant scope, customer/agency reference,
optional client reference, service role, dates/status, delivery lead and approved
non-sensitive onboarding references. If a specialist later needs portal access,
create an explicit invitation/membership and client/action grants through an
authorized path. Do not automatically create portal accounts for staffing orders.

HR, payroll and recruitment pipelines are outside this release. Do not copy CVs,
salary, medical/leave records, payroll or personnel files into assignments, client
knowledge or onboarding by default. Existing Internal Portal HR/PM features remain
in their existing trust boundary; this stage does not modify or expose them.

## S02A-D04 — Reversible draft feature switches

The names below are **conceptual configuration/policy fields**, not implemented
environment variables, database columns, public plan names or new permissions.
No placeholders are added to `.env.example` or `.env.local` in this stage.

| Proposed switch / selection | Draft rule |
| --- | --- |
| `platform_entitled` | Independent active software contract; requires separately authorized users and client access. Specialist-only starts with no platform entitlement. |
| `specialist_engagement_active` | Independent scoped people-services engagement; can be active without any portal identity. Platform-only starts without an engagement. |
| Combined selection | Both offers explicitly agreed; computed commercial grouping does not merge identities, permissions or fee categories. |
| `staffing_tool_mode` | Customer's existing tools remain valid; portal use is an explicit choice requiring software/access approval, not an automatic onboarding step. |
| Licensed module selections | Confirm exact workspace, AI, knowledge, Hubstaff, credit-report and Website Insights inclusions in the approved plan. A newly available module stays unavailable until its inclusion and access policy are approved. |
| `managed_delivery` | Off unless an approved SOW names the delivery manager, scope and fees. |
| Branding selection | Draft/reversible until approved for publication; no automatic Agency Enabled or white-label rollout. |
| Knowledge audiences | Distinct approved platform-common, agency-private and client-scoped audiences; sharing defaults to the narrow authorized scope. |
| Support access | Denied without a specific approved, active grant. A global role or feature toggle cannot bypass customer-data authorization. |
| Personnel-record sharing | No automatic sharing; HR/payroll/recruitment product switches are outside this release. |

Module switches express eligibility, not authorization. Enforce permissions in
Next.js and Python before data retrieval/serialization and again for tools, files,
reports, caches, jobs and exports. Missing agency/source configuration must fail
closed; never fall back to another agency's data or a private global pack.
Draft optional switches do not change current working features in this stage.

## S02A-D05 — Shared AI knowledge and integration authority

**Proposed knowledge audiences:**

- Platform-common: only deliberately approved, sanitized non-customer product
  guidance suitable for every subscribing agency, with a publisher and revision.
- Agency-private: an agency's instructions/playbooks, visible only to authorized
  members of that agency and any narrower source audience.
- Client-scoped: a client's approved documents/project data, requiring the
  agency/client grant and source permission for the requesting actor.
- Private AOC/Admin material: remains private; never included merely because the
  same model, provider credential or deployment serves customer chat.

Common knowledge cannot widen client access or override instructions/permissions.
Prompts and quoted source content are untrusted instructions. Retrieval filtering
must happen before content reaches the model, including on cache hits, search,
thread resume, file citations/downloads and tool calls. Provider credentials are
server-only execution resources, not authority to use all associated documents.

**Existing-code gap:** `findApplicablePreparedPublications` in
`lib/prepared-source-store.js` selects `p.audience='clients'` globally, in addition
to a client/private-admin predicate. It is not an agency-scoped sharing policy.
Before multi-agency release, classify existing shared content and approve what
can remain platform-common; agency/client content must get scoped publication
and retrieval checks. Do not assume existing packs are sanitized, copy a current
global company pack to every agency, or change current sharing in this doc stage.

Drive roots/grants, Hubstaff mappings/indexes, Website Insights/Google properties,
file/vector stores, source workers and reporting jobs need explicit owning agency
and permitted client scope in a later design. An agency/customer's approved Google
authorization does not become a Whitecap personnel permission. Preserve stable
encryption keys and integration binding/freshness checks; do not invent isolated
credentials from the existing global settings. See the example in CONTEXT §14.

## S02A-D06 — AOC support approval and audit

**Proposed workflow; absent from the current application.** Software ownership,
AOC employment and existing global Admin access are not sufficient approval.

1. A named AOC support actor requests access against a ticket/purpose, identifying
   the exact agency, client(s), resources, actions and requested expiry. Prefer
   sanitized diagnostics that do not require customer content.
2. An authorized agency administrator with delegated customer-data authority
   approves or denies that scope. Obtain end-client approval too when the agency
   lacks that authority. The requesting support actor cannot self-approve.
3. Record approval and grant activation durably before access becomes usable.
   Default proposed scope is read-only, finite and limited to the named client.
   Writes, exports, finance, additional sources or paid external operations need
   explicit additional approval; do not infer them from a troubleshooting ticket.
4. Server context binds the actual support identity and grant ID to the agency,
   client, allowed actions and expiry. Revalidate the grant for every request,
   AI retrieval/tool action and cache read. Do not hide the support actor behind
   customer impersonation. Inability to record activation must fail closed.
5. Audit request, approval/denial, activation, exercise, expiry and revocation with
   actor, approver, agency/client scope, permitted action/resource, ticket/purpose
   reference, grant ID, timestamp and outcome. Do not log credentials, raw prompts,
   document bodies or unnecessary personnel information. Relevant access history
   must be reviewable by an authorized agency audit role within its own scope.
6. Expiry/revocation or a relevant membership/assignment change invalidates access
   and affected cached authorization. A grant to Agency A/client A1 never grants
   Agency B/client B1, other A clients or Internal HR access.

Support approval never substitutes for source/provider consent, commercial
approval of a paid operation, or permission to send real messages. Emergency
access needs a separately approved policy; no silent bypass is proposed here.
Leadership/security owners still need to set approver delegation, maximum grant
duration, audit retention and any emergency process before a live rollout.

**Reuse and gap:** Current `resolveAdminContext` admits active global AOC Admins;
it does not enforce agency-approved support grants. `lib/portal-audit.js` and
existing audit schemas provide patterns, but their present action allowlists and
client/Admin scopes do not implement this grant lifecycle or agency dimension.
Later code/migrations and positive/negative staging tests are required. Do not
describe the fictional examples as proof of current enforcement.

## S02A-D07 — Preserve reviewed-baseline credit and usage semantics

Read-only comparison on November 18 reconfirmed that current `master` at
`786b3b5` is behind by `f3bdb19` and `916bbf5`. The committed comparison contains
198 changed paths (distinct from the Stage 01 working-tree comparison).

| Reviewed capability / working path | Product and agency-isolation consequence |
| --- | --- |
| AI Credits: `docs/AI_CREDITS.md`, `/credits`, `/api/credits`, `/admin/credits`, `lib/credits-repository.js`, `database/ai-credits-schema.sql` | Reporting-only monthly allowances/pricing/entries, not a wallet, software purchase, staffing price or payment collection. Keep the cost basis, unknown/pending state, pricing versions and idempotency. Client finance visibility and agency-wide reporting need explicit scoped permissions; current overview access is not a new agency finance-policy decision. |
| Website Insights: `docs/WEBSITE_INSIGHTS.md`, `/api/client/website-insights/**`, `lib/website-insights/**`, `database/website-insights.sql` | An optional module candidate, not an implied specialist service, SEO outcome guarantee or AI charge. Keep approved website/client binding, SSRF/robots protections and separate Search Console consent/property checks. Public source URLs do not make stored client reports or Google data cross-agency public. Preserve its existing role/action differences. |
| Usage history/reset: `/api/admin/ai-usage/history`, `lib/ai-usage-clear-policy.js`, `lib/ai-usage-clear-repository.js`, `database/ai-usage-controls.sql` | Reuse preview, actor-bound expiring confirmation, reset boundaries and retained raw evidence. Existing `client`, all-`clients` and `admin` scopes are global AOC operations, not safe agency-admin queries. Any later agency operation must limit data and audit to that agency; support approval must explicitly cover a financial/reporting mutation. |
| New request/credit semantics | Reviewed master disables portal monthly request caps; provider limits still apply and credit allowances report usage without enforcing prepaid access. Current checkout still reserves monthly requests. If the reviewed commit is the implementation baseline, preserve its semantics rather than restoring old caps as subscription enforcement. Any new entitlement/usage gate requires its own explicit decision. |

Resetting report visibility/consumed-credit history does not erase provider
invoices, assign staffing prices or approve a customer charge. Preserve the
separation of observed provider cost, reporting conversion/fee, software
subscription and staffing fee. Handling support-generated costs is an open
commercial decision, not permission to bill automatically. Do not pool one
agency's allowances, reports, reset actions or historical evidence with another's.

These reviewed features are not installed or re-tested in this checkout. The
Stage 01 build and test results are for the preserved current working tree only.

## S02A-D08 — Recommended implementation branch; no branch change now

**Recommendation, pending repository owner's baseline confirmation:** implement
later agency isolation on **`feat/agency-platform-isolation`**, created in an
isolated checkout/worktree from pinned reviewed master
**`916bbf5b781ea0dd7b3b685d5517694dad4185a7`**. This accounts for Credits,
Website Insights and usage controls from the outset. If that is not the intended
build baseline, select an explicit alternative before implementation.

Leave this dirty `master` at `786b3b5` and the other checkout untouched. Review and
selectively port still-needed local fixes against the chosen baseline; do not
bulk copy, reset or merge over local edits. For example, reviewed master's
`components/ai-assistant/use-assistant-access.js` and this checkout's
`lib/client-ai-access.js` solve related startup behavior through different paths;
retain the chosen working path instead of introducing duplicate access loaders.
Unfinished local index/parallel-worker work must not be declared complete by this
branch recommendation. Configure the isolated target's private environment
deliberately; do not copy either checkout's `.env.local` or assume its DB is staging.

No branch/worktree was created or switched, no commit was fetched/merged, and no
application behavior changed in Stage 02A. This recommendation advances S01-D01's
handoff without silently choosing a production target or authorizing a code stage.

## S02A-D09 — Open decisions and stop gate

| Open decision / prerequisite | Owner / required before | Blocks Stage 02A documentation? |
| --- | --- | --- |
| Platform brand, white-label scope and public ownership wording | Leadership and authorized IP/brand owner, before publication/contracts | No; keep Agency Enabled proposed and presentation reversible. |
| Exact package/module inclusions, support hours/SLA, service obligations, rates, discounts and billing structure | Commercial/software/people-services owners, before quotes, publication or fulfillment commitments | No; draft selections are not offers to customers. |
| Services contracting party, managed-delivery responsibility, deliverable licenses and customer data terms | Authorized commercial/data owners, before relevant contract or delivery | No; use named proposed responsibility categories, no invented employer or legal guarantees. |
| Reviewed implementation baseline and selective local reconciliation | Repository owner, before creating the recommended implementation branch or changing code | No; recommendation is recorded, no implementation started. |
| Disposable or approved staging PostgreSQL target | Database owner, before migrations, fixtures, provisioning or job/report writes | No; all skipped SQL checks carry forward. |
| Support approver authority, duration/retention limits and any emergency access | Customer-data/security owners, before live support grants | No; deny by default and record the proposed approval/audit contract. |
| Classification of current global AI packs and ownership of shared integrations | Source/data owners, before enabling multi-agency retrieval or jobs | No; current global sharing is explicitly recorded as an implementation gap. |

No leadership sign-in or blocking brand/package answer is needed to finish this
documentation stage. Ask only when a subsequent authorized action actually
depends on an unmade decision or named live provider consent.

**Stop after Stage 02/02A.** No agency schema, subscription billing, assignment
provisioning, support grant, branding rollout, permission migration or Internal
Portal change is authorized here. Future agency-isolation implementation requires
a separate explicit stage, target/baseline confirmation and safe database setup.

## S03-D01 — Confirmed baseline and preparation-only database scope

**Owner decision received after the prerequisite review:** use
`feat/agency-platform-isolation` from
`916bbf5b781ea0dd7b3b685d5517694dad4185a7`; **no approved database; prepare migration
only**. This resolves the implementation-base question in S01-D01/S02A-D08, not
the separate private database/role setup prerequisites.

The branch/worktree was created at
`C:\Users\MY PC\Desktop\AOC\chatkit\.tmp\agency-platform-isolation` by importing
the pinned commit from the other existing local repository. Original dirty
`master` remains at `786b3b5`, with local edits and private environment preserved.
Only the three handoff documents were copied into the new worktree; neither
private environment nor local application fixes were copied over reviewed master.
No commit, push, deployment, SQL connection or production mutation occurred.

## S03-D02 — Additive ownership overlay and explicit resource classes

Use a versioned `agency_platform` schema, with one-to-one client ownership,
agency membership, explicit client access and protected database principal maps.
Composite foreign keys require client ownership and user membership in the same
agency, plus the original client/user membership. Preserve legacy clients/users/
memberships and leave unadopted data unavailable through new agency paths.

Resource metadata uses explicit `client`, `agency`, `platform_private`,
`platform_common` or `quarantined` scope with CHECK constraints. NULL agency is
never a visibility grant. Common metadata is limited to an explicitly approved
source pack; credentials, audits, generated assets and billing references cannot
become public by omission. Legacy inventory defaults are classification review
requirements, not bulk permission grants or content migration. Resource locators
do not authorize reading legacy tables or external objects.

Global source publications are not reclassified as safe common knowledge. No
source body, provider credential, generated file, archived ledger row, price or
personnel record is copied, disclosed or automatically adopted. Existing support
consent and commercial terms remain unimplemented draft boundaries.

## S03-D03 — Restricted login binding, policies and trusted owner exception

Prepared RLS enables/FORCEs all eight new tables, with restricted runtime grants.
A PostgreSQL LOGIN maps to exactly one agency; policy lookups validate immutable
`session_user`, active memberships/client grant and transaction-local selectors.
Supplying a foreign agency ID through a custom setting must not change that login
binding. The application must separately authenticate the actor; an agency DB
credential is not individual-user authentication.

The dedicated owner role is an explicit trusted control-plane exception. It can
read all new rows and alter policies; superuser/BYPASSRLS credentials also cannot
be called protected. SECURITY DEFINER lookups have fixed trusted search paths,
fully qualified relations and no PUBLIC execute permission. Runtime checks reject
owner/privileged memberships, broad legacy reads/writes and schema creation.

Keep transaction scope on one checked-out connection, using parameterized local
settings, role/context checks and commit/rollback cleanup; discard tainted sockets.
The Next-only wrapper reuses `lib/database.js`; no application feature pool was
added. Migration/diagnostic scripts use short-lived standard `pg`; Python remains
on `chatkit_backend/database.py` and has no new agency route or connection path.

The existing shared app credentials and legacy tables were not audited live or
switched to these roles. No protection claim extends to current global Admin,
existing Python/client reads or legacy tables. One shared global login must not
be repurposed as a per-request tenant selector. Central connection routing and
restricted agency credentials require later design/verification before Stage 11.

## S03-D04 — Versioned preparation and pending acceptance

Historical preparation decision: its pending-database gate is superseded by the
owner's local-only authorization and completed results in S03-D06 below.

`database/agency-platform/000_role_setup.sql` is a separate privileged DBA action,
not automatically executed by the migration runner. `001_agency_foundation.sql`
is applied transactionally by a checksum/version runner; identical reruns skip,
and unexpected schema/version changes fail. The default CLI is plan-only.

New private configuration names are `AGENCY_MIGRATION_DATABASE_URL` and
`AGENCY_TEST_DATABASE_URL`, with blank example placeholders only. Neither falls
back to `DATABASE_URL`. Application requires a matching explicit database-name
acknowledgement; the real fixture also requires explicit role-fixture consent and
an empty dedicated target with unused role names. Exact setup and limitations are
in [STAGE03_DATABASE](STAGE03_DATABASE.md).

Local tests/lint do not verify SQL, constraints, RLS, actual role privileges or
real pool reuse. The two fictional agencies are prepared as real acceptance
fixtures, not reported as executed. No approved target exists: **Stage 03 SQL
acceptance remains pending**. Prior skipped SQL checks also remain pending.

## S03-D05 — No unfinished mode or automatic next stage

No page, API, worker or Python route imports the new helper; no agency route,
branding switch, staffing pipeline or subscription behavior is exposed. New
agency routes remain deferred until Stage 11 and an explicit rollout. Stop after
Stage 03 preparation; continue only its pending database checks once an approved
target is supplied. Do not auto-start Stage 04 or production provisioning.

## S03-D06 — Approved disposable local verification; stop before Stage 04

**Owner authorization:** create a new disposable local PostgreSQL database, use
Docker if available, configure the two URL names privately and leave Neon alone.
Docker was unavailable; a rootless portable Ubuntu WSL PostgreSQL 18.3 cluster
met that scope without system package/service installation. Loopback listener,
server identity and exact new database names were verified before writes.

Two new databases separated the empty synthetic two-agency fixture from the
standalone migration CLI. The fixture ran first, cleaned its cluster-wide roles,
then the separate migration database was prepared/applied/repeated. All nine
real scenario groups passed, including same-backend reuse and polluted-backend
discard. Independent cleanup and version/FORCE/role/empty-legacy metadata checks
passed; nine offline tests and focused lint passed. A public-schema USAGE cleanup
dependency (2BP01) was fixed in the fixture, with no SQL policy relaxation.

Private values are stored only in the ignored `.env.agency-test`, ACL-restricted
to the Windows owner, sandbox account and SYSTEM. The temporary bootstrap
password file was removed. Neon and original application environment remain
untouched. The local server was stopped, leaving disposable data/binaries for
review; a new fixture run needs a fresh role environment because the retained
migration DB now uses the two NOLOGIN groups.

This completes **Stage 03 local acceptance**, not deployment or protection of
current global service credentials. Owners/superusers remain trusted exceptions;
Neon roles, external poolers and legacy/AI application integration were not tested.
No routes were exposed, commercial decisions published or Stage 04 work started.
Keep the Stage 11 route gate and await a separately authorized subsequent stage.

## S04-D01 — Explicit cohort, additive ownership and customer roles

Adopt only the private manifest's reviewed AOC clients and company source pack.
Retain foreign ownership and reject conflicts; never infer ownership from names
or branding. Preserve legacy IDs/payloads/history with an additive registry and
checksum-tracked version 002. Version 001 stays unchanged. Customer memberships
become `client_user` with existing client access, not staff/admin. Only explicitly
approved active AOC administrators gain agency administrator status.

## S04-D02 — Agency guidance, private controls and quarantine

Company guidance belongs to AOC, not all future agencies. Shared credentials,
Drive caches/grants, provider settings, identity and pricing remain private
platform operations; private admin packs stay private. NULL ownership is never a
grant. Orphans, archives with ambiguous clients, unknown relations and unapproved
publications stay quarantined with sanitized references. Client-readable cohort
ambiguity blocks cutover until resolved. The seven synthetic ambiguity cases
remain withheld; no real ownership decision was requested or invented.

## S04-D03 — Guarded compatibility and honest RLS limits

Deploy compatible DAL guards before adoption; activate ownership filtering and
write hooks only at validated commit. Unmigrated databases retain existing
behavior; an installed inactive marker fails closed. Client selection is AOC-
cohort-only after activation, and publication reads enforce ownership/publisher
activation. Restricted agency LOGINs use the Stage 03 scope/grant checks and a
fingerprint-checked read function; raw legacy/registry reads stay denied. Human
authentication remains required. The broad legacy SQL service is trusted and
outside the RLS claim. No Internal/Python/route/UI or agency-mode rollout occurs.

## S04-D04 — Frozen writers, reversible rehearsal and cutover approval

Use no-write inventory, explicit ownership review, a verified backup/restore and
a maintenance window covering web, Python, jobs, scripts and provisioning. Apply
locks before taking the READ COMMITTED source snapshot. Transactional errors
roll back activation; identical reruns change nothing. Atomic hooks track known
existing-client writes after commit. New clients need explicit adoption until
later provisioning work. After reopening, rollback must preserve/replay intervening
writes. Blind restoration is not allowed. Local synthetic restore passed; real
snapshot, cross-cluster role/secret recovery, PITR/replay and scale remain pending.
Production adoption requires a separate final approval.

## S04-D05 — Completion and next gate

Two no-write dry runs, two idempotent applications, preserved history, quarantine,
restore, eight real SQL groups, 29 offline tests and lint passed locally. Sign-in/
Internal guard mocks and unrun browser/Python/provider checks are explicit. Full
builds remain blocked by local dependency layout/missing existing Website Insights
packages. No dependency/framework changes or commercial decisions were made.
The task server is stopped at closeout. See [runbook](STAGE04_REHEARSAL.md) and
[actual results](PROGRESS.md). Stop before 05; new routes remain gated until 11.


## S08-D01 — Agency source revisions and Stage 20B gate

The former shared company guidance is an AOC-agency publication. Other agencies receive none by subscription or a NULL owner. Keep the legacy `clients` storage key for compatibility while enforcing its explicit agency binding and exposing the effective agency audience during retrieval. Client extras and private Admin guidance retain their separate scopes.

Pin the existing enabled and ownership-reviewed publication, connection and corpus revision in migration 005. New instructions, publication settings and corpus revisions are held from retrieval. Disable is available. Stage 20B will supply draft capture, approver permissions, consent, immutable approval audit and an approved revision transition. No runtime approval-writing route is introduced now.

Tool invocation, tool result delivery and streamed chunks recheck current access. A source or membership revocation blocks subsequent work/delivery, with previously delivered bytes and provider-submitted material outside recall. Hosted model behavior and production performance need their separately scoped live checks.


## S09-D01 — Business connections and replay-safe lifecycle

Keep client Hubstaff mappings, AOC-private Hubstaff credentials, independent Internal Hubstaff identity, AOC Drive publishers, client/site Search Console grants, Make's fixed platform connection test and deployment-wide AI providers as explicit separate ownership classes. New agencies inherit none of AOC's private connections or source approvals.

Use migration 006's protected Google connection ledger for current agency/resource binding and generation. Encrypted OAuth state carries the snapshot. Callback credential writes, reconnects, property changes and disconnects advance or validate generation transactionally. Existing ciphertext stays compatible, and old pending sign-ins must restart.

Drive and Search Console disconnect locally. Google Account app revocation is a separate account-holder action because it can affect other grants using the same OAuth app. Stage 08 approvals remain pinned, so a new Drive connection needs later publication approval.

Retain Make's fixed test. Agency workflows and inbound business events require a separately defined destination/payload contract, authentication and durable event deduplication before activation. The inventory records the managed-secret rotation plan and pending live consent checks. Stage 11 stays gated and work stops before Stage 10.
